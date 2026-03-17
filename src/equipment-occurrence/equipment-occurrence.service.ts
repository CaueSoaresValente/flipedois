import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { EquipmentOccurrence } from './equipment-occurrence.entity';
import { Equipment } from '../equipment/equipment.entity';
import { Event } from '../event/event.entity';
import { ChecklistItem } from '../checklist-item/checklist-item.entity';
import { Checklist } from '../checklist/checklist.entity';
import { StockService } from '../stock/stock.service';

@Injectable()
export class EquipmentOccurrenceService {
  constructor(
    @InjectRepository(EquipmentOccurrence)
    private repo: Repository<EquipmentOccurrence>,

    @InjectRepository(Equipment)
    private equipmentRepo: Repository<Equipment>,

    @InjectRepository(Event)
    private eventRepo: Repository<Event>,

    @InjectRepository(ChecklistItem)
    private checklistItemRepo: Repository<ChecklistItem>,

    private readonly dataSource: DataSource,
    private readonly stockService: StockService,
  ) {}

  // ============================================================
  // CHECKLIST AUTO-SYNC — Single source of truth
  // ============================================================
  /**
   * Recalcula os campos OK/Qb/Pd do checklist item a partir das ocorrências.
   * Esta é a ÚNICA forma de atualizar esses campos.
   *
   * Regra:
   *   quantidadeOk = quantidadeDevolvida - (soma de DANO ativas) - (soma de PERDA ativas)
   *   quantidadeQuebrada = soma de DANO ativas
   *   quantidadePerdida = soma de PERDA ativas
   */
  async syncChecklistItemFromOccurrences(
    manager: EntityManager,
    checklistItemId: number,
  ): Promise<void> {
    if (!checklistItemId) return;

    const item = await manager.findOne(ChecklistItem, {
      where: { id: checklistItemId },
      relations: ['checklist'],
    });

    if (!item) return;

    // Find all active occurrences linked to this checklist item
    // Active = NOT CANCELADO, NOT RESOLVIDO, NOT ACHADO
    const occurrences = await manager.find(EquipmentOccurrence, {
      where: { checklistItemId },
    });

    const activeOccurrences = occurrences.filter(
      (o) => !['CANCELADO', 'RESOLVIDO', 'ACHADO'].includes(o.status),
    );

    const totalDano = activeOccurrences
      .filter((o) => o.tipo === 'DANO')
      .reduce((sum, o) => sum + o.quantidade, 0);

    const totalPerda = activeOccurrences
      .filter((o) => o.tipo === 'PERDA')
      .reduce((sum, o) => sum + o.quantidade, 0);

    const totalOk = Math.max(0, item.quantidadeDevolvida - totalDano - totalPerda);

    item.quantidadeOk = totalOk;
    item.quantidadeQuebrada = totalDano;
    item.quantidadePerdida = totalPerda;

    // Determine status
    if (item.quantidadeDevolvida === 0) {
      item.statusDevolucao = 'pendente';
    } else if (totalPerda > 0) {
      item.statusDevolucao = 'perdido';
    } else if (totalDano > 0) {
      item.statusDevolucao = 'quebrado';
    } else {
      item.statusDevolucao = 'devolvido';
    }

    // Check if any occurrences are still PENDENTE (awaiting confirmation)
    const hasPending = activeOccurrences.some((o) => o.status === 'PENDENTE');
    if (hasPending && item.quantidadeDevolvida > 0) {
      item.statusDevolucao = 'aguardando_confirmacao';
    }

    await manager.save(ChecklistItem, item);

    // Also update the parent checklist status
    await this.atualizarStatusChecklistTx(manager, item.checklistId);
  }

  /**
   * Atualiza status automático do checklist baseado nos itens.
   */
  private async atualizarStatusChecklistTx(
    manager: EntityManager,
    checklistId: number,
  ) {
    const checklist = await manager.findOne(Checklist, {
      where: { id: checklistId },
      relations: ['items'],
    });

    if (!checklist || !checklist.items.length) return;

    const items = checklist.items;

    const todosSeparados = items.every(
      (i: ChecklistItem) => i.quantidadeSeparada === i.quantidadePlanejada,
    );

    const algumDevolvido = items.some(
      (i: ChecklistItem) => i.quantidadeDevolvida > 0,
    );

    const todosFinalizados = items.every(
      (i: ChecklistItem) =>
        i.quantidadeSeparada > 0 &&
        ['devolvido', 'quebrado', 'perdido'].includes(i.statusDevolucao),
    );

    const algumAguardando = items.some(
      (i: ChecklistItem) => i.statusDevolucao === 'aguardando_confirmacao',
    );

    if (todosFinalizados) {
      checklist.status = 'concluido';
    } else if (algumAguardando || algumDevolvido) {
      checklist.status = 'pendente_devolucao';
    } else if (todosSeparados) {
      checklist.status = 'em_evento';
    } else {
      checklist.status = 'liberado';
    }

    await manager.save(Checklist, checklist);
  }

  // ============================================================
  // STOCK REVERSAL HELPER
  // ============================================================
  private async reverterImpactoEstoque(
    manager: EntityManager,
    occurrence: EquipmentOccurrence,
  ) {
    const { tipo, quantidade, equipment, status } = occurrence;

    if (status === 'BAIXADO') {
      if (tipo === 'DANO') {
        await this.stockService.cancelarDano(manager, equipment.id, quantidade);
      } else if (tipo === 'PERDA') {
        await this.stockService.cancelarPerda(
          manager,
          equipment.id,
          quantidade,
        );
      } else if (tipo === 'AJUSTE') {
        await this.stockService.ajustarEstoque(
          manager,
          equipment.id,
          -quantidade,
        );
      }
      return;
    }

    if (status === 'PENDENTE') {
      // PENDENTE: stock has NOT been touched yet for DANO/PERDA from returns
      // Only AJUSTE and manual occurrences may have touched stock
      if (tipo === 'AJUSTE') {
        await this.stockService.ajustarEstoque(
          manager,
          equipment.id,
          -quantidade,
        );
      }
      // DANO/PERDA PENDENTE: no stock to revert (stock is changed on BAIXADO)
    }
  }

  // ============================================================
  // REGISTRAR (create occurrence)
  // ============================================================
  /**
   * Registra uma ocorrência de dano, perda ou ajuste.
   *
   * Para DANO e PERDA gerados via devolução de checklist (manual = false):
   *   NÃO altera estoque. Estoque só muda via confirmarBaixa().
   *
   * Para DANO e PERDA manuais (manual = true):
   *   ajusta estoque imediatamente: disponivel -= qty, danificada/perdida += qty, total -= qty
   *
   * Para AJUSTE: afeta estoque apenas ao ser confirmada.
   */
  async registrar(
    eventId: number | null,
    equipmentId: number,
    quantidade: number,
    descricao?: string,
    tipo: 'DANO' | 'PERDA' | 'AJUSTE' = 'DANO',
    motivo?: string,
    manual: boolean = false,
    checklistItemId?: number | null,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const equipment = await manager.findOne(Equipment, {
        where: { id: equipmentId },
      });

      if (!equipment)
        throw new BadRequestException('Equipamento não encontrado.');

      let event: Event | null = null;
      if (eventId) {
        event = await manager.findOne(Event, { where: { id: eventId } });
        if (!event) throw new BadRequestException('Evento não encontrado.');
      }

      if (quantidade <= 0) {
        throw new BadRequestException(
          'Quantidade inválida. Deve ser maior que zero.',
        );
      }

      if (tipo === 'AJUSTE' && !motivo) {
        throw new BadRequestException(
          'Motivo é obrigatório para ajuste de estoque.',
        );
      }

      // Manual DANO/PERDA: ajusta estoque imediatamente (de disponível)
      if (manual && tipo === 'DANO') {
        await this.stockService.registrarDanoManual(
          manager,
          equipmentId,
          quantidade,
        );
      } else if (manual && tipo === 'PERDA') {
        await this.stockService.registrarPerdaManual(
          manager,
          equipmentId,
          quantidade,
        );
      }

      const occurrence = manager.create(EquipmentOccurrence, {
        equipment,
        quantidade,
        descricao,
        tipo,
        motivo,
        status: 'PENDENTE',
        checklistItemId: checklistItemId ?? null,
        ...(event ? { event } : {}),
      });

      const saved = await manager.save(EquipmentOccurrence, occurrence);

      // Auto-sync checklist if linked
      if (checklistItemId) {
        await this.syncChecklistItemFromOccurrences(manager, checklistItemId);
      }

      return saved;
    });
  }

  /**
   * Registrar ocorrência dentro de uma transação existente (para uso pelo checklist-item service).
   */
  async registrarTx(
    manager: EntityManager,
    eventId: number | null,
    equipmentId: number,
    quantidade: number,
    descricao: string,
    tipo: 'DANO' | 'PERDA',
    motivo: string,
    checklistItemId: number | null,
  ): Promise<EquipmentOccurrence> {
    const equipment = await manager.findOne(Equipment, {
      where: { id: equipmentId },
    });

    if (!equipment)
      throw new BadRequestException('Equipamento não encontrado.');

    let event: Event | null = null;
    if (eventId) {
      event = await manager.findOne(Event, { where: { id: eventId } });
    }

    const occurrence = manager.create(EquipmentOccurrence, {
      equipment,
      quantidade,
      descricao,
      tipo,
      motivo,
      status: 'PENDENTE',
      checklistItemId,
      ...(event ? { event } : {}),
    });

    return manager.save(EquipmentOccurrence, occurrence);
  }

  // ============================================================
  // CONFIRMAR BAIXA — ONLY place where DANO/PERDA stock changes happen
  // ============================================================
  /**
   * CONFIRMAR BAIXA: Efetua a alteração de estoque para DANO/PERDA.
   *
   * DANO: emUso -= qty, danificada += qty, total -= qty
   * PERDA: emUso -= qty, perdida += qty, total -= qty
   * AJUSTE: total += qty, disponivel += qty
   *
   * Após confirmar, sincroniza o checklist item automaticamente.
   */
  async confirmarBaixa(id: number) {
    return this.dataSource.transaction(async (manager) => {
      const occurrence = await manager.findOne(EquipmentOccurrence, {
        where: { id },
        relations: ['equipment'],
      });

      if (!occurrence)
        throw new BadRequestException('Ocorrência não encontrada.');

      if (occurrence.status !== 'PENDENTE') {
        throw new BadRequestException('Ocorrência já foi processada.');
      }

      const { tipo, quantidade, equipment } = occurrence;

      if (tipo === 'DANO') {
        await this.stockService.registrarDevolucaoDanificado(
          manager,
          equipment.id,
          quantidade,
        );
      } else if (tipo === 'PERDA') {
        await this.stockService.registrarDevolucaoPerdido(
          manager,
          equipment.id,
          quantidade,
        );
      } else if (tipo === 'AJUSTE') {
        await this.stockService.ajustarEstoque(
          manager,
          equipment.id,
          quantidade,
        );
      }

      occurrence.status = 'BAIXADO';
      const saved = await manager.save(EquipmentOccurrence, occurrence);

      // Auto-sync linked checklist item
      if (occurrence.checklistItemId) {
        await this.syncChecklistItemFromOccurrences(
          manager,
          occurrence.checklistItemId,
        );
      }

      return saved;
    });
  }

  // ============================================================
  // CANCELAR — Reverts stock and syncs checklist
  // ============================================================
  async cancelar(id: number) {
    return this.dataSource.transaction(async (manager) => {
      const occurrence = await manager.findOne(EquipmentOccurrence, {
        where: { id },
        relations: ['equipment'],
      });

      if (!occurrence)
        throw new BadRequestException('Ocorrência não encontrada.');

      if (['CANCELADO', 'RESOLVIDO', 'ACHADO'].includes(occurrence.status)) {
        throw new BadRequestException('Ocorrência já foi encerrada.');
      }

      await this.reverterImpactoEstoque(manager, occurrence);

      occurrence.status = 'CANCELADO';
      const saved = await manager.save(EquipmentOccurrence, occurrence);

      // Auto-sync linked checklist item
      if (occurrence.checklistItemId) {
        await this.syncChecklistItemFromOccurrences(
          manager,
          occurrence.checklistItemId,
        );
      }

      return saved;
    });
  }

  async resolver(id: number) {
    return this.dataSource.transaction(async (manager) => {
      const occurrence = await manager.findOne(EquipmentOccurrence, {
        where: { id },
        relations: ['equipment'],
      });
      if (!occurrence)
        throw new BadRequestException('Ocorrência não encontrada.');
      if (['CANCELADO', 'RESOLVIDO', 'ACHADO'].includes(occurrence.status)) {
        throw new BadRequestException('Ocorrência já foi encerrada.');
      }

      await this.reverterImpactoEstoque(manager, occurrence);
      occurrence.status = 'RESOLVIDO';
      const saved = await manager.save(EquipmentOccurrence, occurrence);

      // Auto-sync linked checklist item
      if (occurrence.checklistItemId) {
        await this.syncChecklistItemFromOccurrences(
          manager,
          occurrence.checklistItemId,
        );
      }

      return saved;
    });
  }

  async achar(id: number) {
    return this.dataSource.transaction(async (manager) => {
      const occurrence = await manager.findOne(EquipmentOccurrence, {
        where: { id },
        relations: ['equipment'],
      });
      if (!occurrence)
        throw new BadRequestException('Ocorrência não encontrada.');
      if (['CANCELADO', 'RESOLVIDO', 'ACHADO'].includes(occurrence.status)) {
        throw new BadRequestException('Ocorrência já foi encerrada.');
      }

      await this.reverterImpactoEstoque(manager, occurrence);
      occurrence.status = 'ACHADO';
      const saved = await manager.save(EquipmentOccurrence, occurrence);

      // Auto-sync linked checklist item
      if (occurrence.checklistItemId) {
        await this.syncChecklistItemFromOccurrences(
          manager,
          occurrence.checklistItemId,
        );
      }

      return saved;
    });
  }

  // ============================================================
  // EDITAR — Update occurrence and sync checklist
  // ============================================================
  /**
   * EDITAR OCORRÊNCIA: Permite alterar quantidade e/ou descrição.
   * Somente ocorrências PENDENTES podem ser editadas.
   *
   * PENDENTE occurrences from returns: stock has NOT been touched yet.
   * So editing just changes the occurrence record + syncs checklist.
   *
   * PENDENTE manual occurrences: stock WAS touched on creation.
   * Need to reverse old and apply new.
   */
  async editar(id: number, quantidade?: number, descricao?: string) {
    return this.dataSource.transaction(async (manager) => {
      const occurrence = await manager.findOne(EquipmentOccurrence, {
        where: { id },
        relations: ['equipment'],
      });

      if (!occurrence)
        throw new BadRequestException('Ocorrência não encontrada.');

      if (occurrence.status !== 'PENDENTE') {
        throw new BadRequestException(
          'Somente ocorrências pendentes podem ser editadas.',
        );
      }

      // Update description if provided
      if (descricao !== undefined) {
        occurrence.descricao = descricao;
      }

      // Update quantity if provided and different
      if (quantidade !== undefined && quantidade !== occurrence.quantidade) {
        if (quantidade <= 0) {
          throw new BadRequestException(
            'Quantidade inválida. Deve ser maior que zero.',
          );
        }

        const { tipo, equipment } = occurrence;
        const qtyAntiga = occurrence.quantidade;
        const isManual = !occurrence.checklistItemId; // Manual if no checklist link

        if (isManual) {
          // Manual occurrences had stock adjusted on creation → reverse and re-apply
          if (tipo === 'DANO') {
            await this.stockService.cancelarDano(
              manager,
              equipment.id,
              qtyAntiga,
            );
            await this.stockService.registrarDanoManual(
              manager,
              equipment.id,
              quantidade,
            );
          } else if (tipo === 'PERDA') {
            await this.stockService.cancelarPerda(
              manager,
              equipment.id,
              qtyAntiga,
            );
            await this.stockService.registrarPerdaManual(
              manager,
              equipment.id,
              quantidade,
            );
          }
        }
        // Return-linked occurrences (PENDENTE): stock not touched yet, just update qty

        occurrence.quantidade = quantidade;
      }

      const saved = await manager.save(EquipmentOccurrence, occurrence);

      // Auto-sync linked checklist item
      if (occurrence.checklistItemId) {
        await this.syncChecklistItemFromOccurrences(
          manager,
          occurrence.checklistItemId,
        );
      }

      return saved;
    });
  }

  findAll() {
    return this.repo.find({
      order: { createdAt: 'DESC' },
      relations: ['equipment', 'event'],
    });
  }
}
