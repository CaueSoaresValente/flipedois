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

    @InjectRepository(Checklist)
    private checklistRepo: Repository<Checklist>,

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
    // Active = NOT CANCELADO
    const occurrences = await manager.find(EquipmentOccurrence, {
      where: { checklistItemId },
    });

    const activeOccurrences = occurrences.filter(
      (o) => o.status !== 'CANCELADO',
    );

    const totalDano = activeOccurrences
      .filter((o) => o.tipo === 'DANO')
      .reduce((sum, o) => sum + o.quantidade, 0);

    const totalPerdaBaixada = activeOccurrences
      .filter((o) => o.tipo === 'PERDA' && o.status === 'BAIXADO')
      .reduce((sum, o) => sum + o.quantidade, 0);

    const totalPerdaPendente = activeOccurrences
      .filter((o) => o.tipo === 'PERDA' && o.status === 'PENDENTE')
      .reduce((sum, o) => sum + o.quantidade, 0);

    // O campo quantidadeDevolvida agora é dinâmico: original - perdas confirmadas
    item.quantidadeDevolvida = Math.max(0, item.quantidadeDevolvidaOriginal - totalPerdaBaixada);
    
    // OK = O que foi devolvido (ajustado) - Danos - Perdas que ainda não baixaram do Devol.
    const baseOk = Math.max(0, item.quantidadeDevolvida - totalDano - totalPerdaPendente);
    
    item.quantidadeOk = baseOk;
    item.quantidadeQuebrada = totalDano;
    item.quantidadePerdida = totalPerdaBaixada + totalPerdaPendente;

    // Determine status
    if (item.quantidadeDevolvida === 0) {
      item.statusDevolucao = 'pendente';
    } else if (item.quantidadePerdida > 0) {
      item.statusDevolucao = 'perdido';
    } else if (item.quantidadeQuebrada > 0) {
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

  /**
   * Valida se um equipamento participou de um evento e retorna os dados do checklist item.
   */
  async validarEventoEquipamento(eventId: number, equipmentId: number) {
    const checklist = await this.checklistRepo.findOne({
      where: { eventId },
    });

    if (!checklist) {
      return { valido: false, mensagem: 'Evento não possui checklist.' };
    }

    const item = await this.checklistItemRepo.findOne({
      where: { checklistId: checklist.id, equipmentId },
    });

    if (!item) {
      return { valido: false, mensagem: 'Este equipamento não participou deste evento.' };
    }

    return {
      valido: true,
      checklistItemId: item.id,
      quantidadeOk: item.quantidadeOk,
      quantidadeDevolvida: item.quantidadeDevolvida,
    };
  }

  // ============================================================
  // STOCK REVERSAL HELPER
  // ============================================================
  /**
   * Reverte o impacto no estoque de uma ocorrência.
   *
   * BAIXADO: estoque foi alterado na confirmação → reverter
   * PENDENTE manual: estoque foi alterado na criação → reverter
   * PENDENTE de devolução: itens ainda em emUso → retornar para disponivel
   */
  private async reverterImpactoEstoque(
    manager: EntityManager,
    occurrence: EquipmentOccurrence,
  ) {
    const { tipo, quantidade, equipment, status } = occurrence;
    const isManual = !!occurrence.manual;

    if (status === 'BAIXADO' || status === 'RESOLVIDO') {
      // BAIXADO: estoque foi alterado na confirmação → reverter
      if (tipo === 'DANO') {
        // cancelarDano: danificada -= qty, disponivel += qty (igual para manual e checklist)
        await this.stockService.cancelarDano(manager, equipment.id, quantidade);
      } else if (tipo === 'PERDA') {
        // cancelarPerda: perdida -= qty, disponivel += qty, total += qty (igual para manual e checklist)
        await this.stockService.cancelarPerda(manager, equipment.id, quantidade);
      } else if (tipo === 'OK') {
        if (isManual) {
          // OK manual BAIXADO: disponivel foi ajustado → sem reversão adicional
          // (manual OK es incomum, mas se existir, não precisa reverter)
        } else {
          // OK checklist RESOLVIDO: emUso -= qty, disponivel += qty → reverter: reservar
          await this.stockService.reservarEstoque(
            manager,
            equipment.id,
            quantidade,
          );
        }
      }
    }
    // Se status é PENDENTE: estoque NÃO foi alterado ainda (modelo "Confirm Always")
  }

  // aplicarImpactoEstoque removido: impacto agora só em confirmarBaixa()

  // ============================================================
  // REGISTRAR (create occurrence)
  // ============================================================
  /**
   * Registra uma ocorrência de dano, perda ou ok.
   *
   * Para DANO e PERDA gerados via devolução de checklist (manual = false):
   *   NÍO altera estoque. Estoque só muda via confirmarBaixa().
   *
   * Para DANO e PERDA manuais (manual = true):
   *   NÍO altera estoque na criação. Estoque só muda via confirmarBaixa().
   */
  async registrar(
    eventId: number | null,
    equipmentId: number,
    quantidade: number,
    descricao?: string,
    tipo: 'OK' | 'DANO' | 'PERDA' = 'DANO',
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

      // 🔴 REGRA DE VALIDAÇÃO MANUAL
      if (manual) {
        if (eventId) {
          // Se tem evento, a ocorrência manual deve ser vinculada ao checklist item
          const validacao = await this.validarEventoEquipamento(eventId, equipmentId);
          if (!validacao.valido || validacao.quantidadeOk === undefined) {
            throw new BadRequestException(validacao.mensagem || 'Falha na validação do evento.');
          }

          if (quantidade > (validacao.quantidadeOk ?? 0)) {
            throw new BadRequestException(
              `A quantidade informada (${quantidade}) excede o saldo OK deste equipamento no evento (${validacao.quantidadeOk}).`,
            );
          }
          checklistItemId = validacao.checklistItemId;
        } else {
          // Sem evento: validação contra estoque disponível ou em uso conforme o tipo
          if (tipo === 'OK') {
            if (quantidade > equipment.quantidadeEmUso) {
              throw new BadRequestException(
                `A quantidade informada (${quantidade}) excede o saldo em uso do equipamento (${equipment.quantidadeEmUso}).`,
              );
            }
          } else {
            // DANO ou PERDA manual sem evento sai do DISPONÍVEL
            if (quantidade > equipment.quantidadeDisponivel) {
              throw new BadRequestException(
                `A quantidade informada (${quantidade}) excede o saldo disponível do equipamento (${equipment.quantidadeDisponivel}).`,
              );
            }
          }
        }
      }

      // 🔴 REGRA UNIFICADA: Manual NÃO altera estoque na criação.
      // Toda mutação acontece via confirmarBaixa().
      // Isso evita bit-rot e dupla mutação.
      // Manual OK: doesn't make much sense manually from scratch in registrar(), 
      // but if allowed, will only change stock on confirm.

      const occurrence = manager.create(EquipmentOccurrence, {
        equipment,
        quantidade,
        descricao,
        tipo,
        status: 'PENDENTE',
        checklistItemId: checklistItemId ?? null,
        manual,
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
   * CONFIRMAR BAIXA: Efetua a alteração de estoque para DANO/PERDA/OK.
   *
   * DANO: emUso (ou disponivel) -= qty, danificada += qty
   * PERDA: emUso (ou disponivel) -= qty, perdida += qty, total -= qty
   * OK: emUso -= qty, disponivel += qty
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
      const isManual = !!occurrence.manual;

      // Sempre recarrega com lock para garantir integridade
      const eq = await manager.findOne(Equipment, {
        where: { id: equipment.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!eq) throw new BadRequestException('Equipamento não encontrado.');

      // REGRA CHAVE:
      // - Manual (manual=true): equipamento já foi devolvido OK → estoque sai de DISPONÍVEL
      // - Checklist-generated (manual=false): equipamento está em uso → estoque sai de EM_USO
      if (tipo === 'DANO') {
        if (isManual) {
          // Manual: disponivel -= qty, danificada += qty
          await this.stockService.registrarDanoManual(
            manager,
            eq.id,
            quantidade,
          );
        } else {
          // Checklist-generated: emUso -= qty, danificada += qty
          await this.stockService.registrarDevolucaoDanificado(
            manager,
            eq.id,
            quantidade,
          );
        }
      } else if (tipo === 'PERDA') {
        if (isManual) {
          // Manual: disponivel -= qty, perdida += qty, total -= qty
          await this.stockService.registrarPerdaManual(
            manager,
            eq.id,
            quantidade,
          );
        } else {
          // Checklist-generated: emUso -= qty, perdida += qty, total -= qty
          await this.stockService.registrarDevolucaoPerdido(
            manager,
            eq.id,
            quantidade,
          );
        }
      } else if (tipo === 'OK') {
        if (!isManual && eq.quantidadeEmUso >= quantidade) {
          // Checklist OK: emUso -= qty, disponivel += qty
          await this.stockService.registrarDevolucaoOk(
            manager,
            eq.id,
            quantidade,
          );
        }
        // Manual OK: não faz sentido na maioria dos cenários
      }

      // OK = resolved (back to stock), DANO/PERDA = written off
      occurrence.status = occurrence.tipo === 'OK' ? 'RESOLVIDO' : 'BAIXADO';
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
  // CANCELAR — Reverts stock (Manual only)
  // ============================================================
  async cancelar(id: number) {
    return this.dataSource.transaction(async (manager) => {
      const occurrence = await manager.findOne(EquipmentOccurrence, {
        where: { id },
        relations: ['equipment'],
      });

      if (!occurrence)
        throw new BadRequestException('Ocorrência não encontrada.');

      if (occurrence.checklistItemId) {
        throw new BadRequestException(
          'Não é possível cancelar uma ocorrência vinculada a um checklist.',
        );
      }

      if (!['PENDENTE', 'RESOLVIDO'].includes(occurrence.status)) {
        throw new BadRequestException(
          'Apenas ocorrências pendentes ou resolvidas podem ser canceladas.',
        );
      }

      await this.reverterImpactoEstoque(manager, occurrence);
      occurrence.status = 'CANCELADO';

      return manager.save(EquipmentOccurrence, occurrence);
    });
  }

  // ============================================================
  // CANCELAR — Reverts stock and syncs checklist
  // ============================================================


  // ============================================================
  // EDITAR — Edição completa de ocorrência com reversão de estoque
  // ============================================================
  /**
   * EDITAR OCORRÊNCIA: Apenas tipo e descrição podem ser alterados.
   * Quantidade e equipamento são IMUTÁVEIS após a criação.
   * Somente ocorrências PENDENTES podem ser editadas.
   *
   * LÓGICA DE REVERSÃO (quando muda tipo):
   * 1. Reverte o impacto de estoque da ocorrência atual
   * 2. Atualiza os campos da ocorrência
   * 3. Reaplica o impacto de estoque com os novos valores
   * 4. Sincroniza o checklist vinculado (se houver)
   *
   * TUDO dentro de transação — se falhar, rollback completo.
   */
  async editar(
    id: number,
    quantidade?: number,
    descricao?: string,
    tipo?: 'OK' | 'DANO' | 'PERDA',
    equipmentId?: number,
  ) {
    // 🔴 REGRA: Quantidade e equipamento NÃO podem ser alterados após a criação
    if (quantidade !== undefined) {
      throw new BadRequestException('A quantidade não pode ser alterada após a criação da ocorrência.');
    }
    if (equipmentId !== undefined) {
      throw new BadRequestException('O equipamento não pode ser alterado após a criação da ocorrência.');
    }
    if (tipo && !['OK', 'DANO', 'PERDA'].includes(tipo)) throw new BadRequestException('Tipo inválido.');

    return this.dataSource.transaction(async (manager) => {
      const occurrence = await manager.findOne(EquipmentOccurrence, {
        where: { id },
        relations: ['equipment'],
      });

      if (!occurrence)
        throw new BadRequestException('Ocorrência não encontrada.');

      const isChecklist = !!occurrence.checklistItemId;

      // 🔴 Checklist occurrences: cannot change quantity or equipment
      if (isChecklist) {
        if (quantidade !== undefined && quantidade !== occurrence.quantidade) {
          throw new BadRequestException('Não é possível editar a quantidade de uma ocorrência de checklist.');
        }
        if (equipmentId !== undefined && equipmentId !== occurrence.equipment.id) {
          throw new BadRequestException('Não é possível trocar o equipamento de uma ocorrência de checklist.');
        }
      }

      const mudouQuantidade = quantidade !== undefined && quantidade !== occurrence.quantidade;
      const mudouTipo = tipo !== undefined && tipo !== occurrence.tipo;
      const mudouEquipamento = equipmentId !== undefined && equipmentId !== (occurrence.equipment?.id);

      const precisaReversao = mudouQuantidade || mudouTipo || mudouEquipamento;

      if (precisaReversao) {
        const eraBaixado = occurrence.status === 'BAIXADO';
        const eraResolvido = occurrence.status === 'RESOLVIDO';
        const tipoAntigo = occurrence.tipo; // Save BEFORE mutation

        // ============================================================
        // STEP 1: Reverse old stock impact (only if stock was applied)
        // ============================================================
        if (eraBaixado || eraResolvido) {
          await this.reverterImpactoEstoque(manager, occurrence);
        }

        // ============================================================
        // STEP 2: Update occurrence fields
        // ============================================================
        if (mudouEquipamento) {
          const novoEquipment = await manager.findOne(Equipment, { where: { id: equipmentId } });
          if (!novoEquipment) throw new BadRequestException('Equipamento não encontrado.');
          occurrence.equipment = novoEquipment;
        }

        if (mudouTipo) occurrence.tipo = tipo!;
        if (mudouQuantidade) occurrence.quantidade = quantidade!;

        // ============================================================
        // STEP 3: Re-apply stock with NEW values (only if it was applied before)
        // ============================================================
        if (eraBaixado || eraResolvido) {
          const novoTipo = occurrence.tipo;
          const novaQtd = occurrence.quantidade;
          const equipId = occurrence.equipment.id;
          const isManual = !!occurrence.manual;

          // After reversal, qty always lands in DISPONIVEL
          // (cancelarDano → disponivel, cancelarPerda → disponivel, OK reversal → emUso)
          const qtyInDisponivel = tipoAntigo === 'DANO' || tipoAntigo === 'PERDA';
          const qtyInEmUso = tipoAntigo === 'OK' && !isManual;

          if (novoTipo === 'DANO') {
            if (qtyInDisponivel || isManual) {
              // disponivel → danificada
              await this.stockService.registrarDanoManual(manager, equipId, novaQtd);
            } else if (qtyInEmUso) {
              // emUso → danificada
              await this.stockService.registrarDevolucaoDanificado(manager, equipId, novaQtd);
            }
          } else if (novoTipo === 'PERDA') {
            if (qtyInDisponivel || isManual) {
              // disponivel → perdida + total reduction
              await this.stockService.registrarPerdaManual(manager, equipId, novaQtd);
            } else if (qtyInEmUso) {
              // emUso → perdida + total reduction
              await this.stockService.registrarDevolucaoPerdido(manager, equipId, novaQtd);
            }
          } else if (novoTipo === 'OK') {
            if (qtyInEmUso) {
              // emUso → disponivel
              await this.stockService.registrarDevolucaoOk(manager, equipId, novaQtd);
            }
            // If qtyInDisponivel or isManual: already there after reversal, no-op
          }
        }
        // If was PENDENTE: no stock was applied, no re-application needed

        // ============================================================
        // STEP 4: Set correct status based on new type
        // ============================================================
        if (eraBaixado || eraResolvido) {
          if (occurrence.tipo === 'OK') {
            // OK = item returned to stock → RESOLVIDO (not BAIXADO)
            occurrence.status = 'RESOLVIDO';
          } else {
            // DANO/PERDA = stock was already re-applied above → BAIXADO
            // Setting PENDENTE here would cause DOUBLE stock mutation
            // if someone clicks "Confirmar" again
            occurrence.status = 'BAIXADO';
          }
        }
        // If was PENDENTE: stays PENDENTE regardless of type change
      }

      if (descricao !== undefined) occurrence.descricao = descricao;

      const saved = await manager.save(EquipmentOccurrence, occurrence);

      if (occurrence.checklistItemId) {
        await this.syncChecklistItemFromOccurrences(manager, occurrence.checklistItemId);
      }

      return saved;
    });
  }

  async findAll(page = 1, limit = 20) {
    const [data, total] = await this.repo.findAndCount({
      order: { createdAt: 'DESC' },
      relations: ['equipment', 'event'],
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
