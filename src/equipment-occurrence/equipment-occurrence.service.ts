import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { EquipmentOccurrence } from './equipment-occurrence.entity';
import { Equipment } from '../equipment/equipment.entity';
import { Event } from '../event/event.entity';
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

    private readonly dataSource: DataSource,
    private readonly stockService: StockService,
  ) {}

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
      // DANO/PERDA: estoque já foi ajustado na devolução → reverter write-off
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
    }
  }

  /**
   * Registra uma ocorrência de dano, perda ou ajuste.
   *
   * Para DANO e PERDA gerados via devolução de checklist (manual = false):
   *   o estoque JÁ foi ajustado na devolução. Status = PENDENTE (auditoria).
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
        ...(event ? { event } : {}),
      });

      return manager.save(EquipmentOccurrence, occurrence);
    });
  }

  /**
   * CONFIRMAR BAIXA: Finaliza o registro de auditoria da ocorrência.
   *
   * DANO / PERDA: Estoque já foi ajustado na devolução do item.
   *   → Apenas muda o status para BAIXADO (sem tocar estoque).
   *
   * AJUSTE: Ajusta estoque total e disponível conforme delta.
   *   → Único caso onde esta ação ainda mexe no estoque.
   *
   * Resultado: sem double-subtraction.
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

      if (tipo === 'AJUSTE') {
        // AJUSTE: único tipo que ainda afeta estoque na confirmação
        await this.stockService.ajustarEstoque(
          manager,
          equipment.id,
          quantidade,
        );
      }
      // DANO e PERDA: estoque já ajustado na devolução → sem ação adicional

      occurrence.status = 'BAIXADO';
      return manager.save(EquipmentOccurrence, occurrence);
    });
  }

  /**
   * CANCELAR OCORRÊNCIA: Reverte o impacto no estoque conforme status e tipo.
   *
   * ┌─────────────┬────────────────┬─────────────────────────────────────────────────────┐
   * │ Status      │ Tipo           │ Ação de Estoque                                     │
   * ├─────────────┼────────────────┼─────────────────────────────────────────────────────┤
   * │ PENDENTE    │ DANO / PERDA   │ NÃO mexe (estoque já ajustado na devolução)         │
   * │ BAIXADO     │ DANO           │ cancelarDano: danificada -= qty, disponivel +=, total+=│
   * │ BAIXADO     │ PERDA          │ cancelarPerda: perdida -= qty, disponivel +=, total+= │
   * │ PENDENTE/   │ AJUSTE         │ ajustarEstoque(-qty): reverte o ajuste              │
   * │ BAIXADO     │                │                                                     │
   * └─────────────┴────────────────┴─────────────────────────────────────────────────────┘
   *
   * Cenário principal: Equipamento danificado foi reparado.
   *  → Ocorrência BAIXADO/DANO cancelada → danificada → disponivel, total++
   */
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
      return manager.save(EquipmentOccurrence, occurrence);
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
      return manager.save(EquipmentOccurrence, occurrence);
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
      return manager.save(EquipmentOccurrence, occurrence);
    });
  }

  /**
   * EDITAR OCORRÊNCIA: Permite alterar quantidade e/ou descrição.
   * Somente ocorrências PENDENTES podem ser editadas.
   *
   * Se a quantidade mudar, a diferença é aplicada atomicamente:
   *   1. Reverte o impacto original (DANO/PERDA manual: disponivel +=, danificada/perdida -=, total +=)
   *   2. Aplica o novo impacto (disponivel -=, danificada/perdida +=, total -=)
   *
   * Nota: Ocorrências geradas via devolução (manual=false) tiveram estoque ajustado
   * na devolução. Reverter e re-aplicar com nova quantidade mantém integridade.
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

      // Atualizar descrição se fornecida
      if (descricao !== undefined) {
        occurrence.descricao = descricao;
      }

      // Atualizar quantidade se fornecida e diferente
      if (quantidade !== undefined && quantidade !== occurrence.quantidade) {
        if (quantidade <= 0) {
          throw new BadRequestException(
            'Quantidade inválida. Deve ser maior que zero.',
          );
        }

        const { tipo, equipment } = occurrence;
        const qtyAntiga = occurrence.quantidade;

        // 1. Reverter impacto original
        if (tipo === 'DANO') {
          await this.stockService.cancelarDano(
            manager,
            equipment.id,
            qtyAntiga,
          );
        } else if (tipo === 'PERDA') {
          await this.stockService.cancelarPerda(
            manager,
            equipment.id,
            qtyAntiga,
          );
        } else if (tipo === 'AJUSTE') {
          // AJUSTE PENDENTE: estoque ainda não foi ajustado na confirmação
          // Nada a reverter
        }

        // 2. Aplicar novo impacto
        if (tipo === 'DANO') {
          await this.stockService.registrarDanoManual(
            manager,
            equipment.id,
            quantidade,
          );
        } else if (tipo === 'PERDA') {
          await this.stockService.registrarPerdaManual(
            manager,
            equipment.id,
            quantidade,
          );
        }
        // AJUSTE: será aplicado apenas na confirmação

        occurrence.quantidade = quantidade;
      }

      return manager.save(EquipmentOccurrence, occurrence);
    });
  }

  findAll() {
    return this.repo.find({
      order: { createdAt: 'DESC' },
      relations: ['equipment', 'event'],
    });
  }
}
