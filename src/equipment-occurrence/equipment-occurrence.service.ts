import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

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

  /**
   * Registra uma ocorrência de dano, perda ou ajuste.
   *
   * IMPORTANTE: Para DANO e PERDA gerados via devolução de checklist,
   * o estoque JÁ foi ajustado no momento da devolução.
   * Esta ocorrência existe apenas como registro de auditoria.
   *
   * Para AJUSTE: afeta estoque diretamente ao ser confirmada.
   */
  async registrar(
    eventId: number | null,
    equipmentId: number,
    quantidade: number,
    descricao?: string,
    tipo: 'DANO' | 'PERDA' | 'AJUSTE' = 'DANO',
    motivo?: string,
  ) {
    const equipment = await this.equipmentRepo.findOne({
      where: { id: equipmentId },
    });

    if (!equipment) throw new BadRequestException('Equipamento não encontrado.');

    let event: Event | null = null;
    if (eventId) {
      event = await this.eventRepo.findOne({ where: { id: eventId } });
      if (!event) throw new BadRequestException('Evento não encontrado.');
    }

    if (quantidade <= 0) {
      throw new BadRequestException('Quantidade inválida. Deve ser maior que zero.');
    }

    if (tipo === 'AJUSTE' && !motivo) {
      throw new BadRequestException('Motivo é obrigatório para ajuste de estoque.');
    }

    const occurrence = this.repo.create({
      equipment,
      quantidade,
      descricao,
      tipo,
      motivo,
      status: 'PENDENTE',
      ...(event ? { event } : {}),
    });

    return this.repo.save(occurrence);
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

      if (!occurrence) throw new BadRequestException('Ocorrência não encontrada.');

      if (occurrence.status !== 'PENDENTE') {
        throw new BadRequestException('Ocorrência já foi processada.');
      }

      const { tipo, quantidade, equipment } = occurrence;

      if (tipo === 'AJUSTE') {
        // AJUSTE: único tipo que ainda afeta estoque na confirmação
        await this.stockService.ajustarEstoque(manager, equipment.id, quantidade);
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

      if (!occurrence) throw new BadRequestException('Ocorrência não encontrada.');

      if (occurrence.status === 'CANCELADO') {
        throw new BadRequestException('Ocorrência já está cancelada.');
      }

      const { tipo, quantidade, equipment, status } = occurrence;

      if (status === 'BAIXADO') {
        // Ocorrência já confirmada — reverter ajuste de estoque
        if (tipo === 'DANO') {
          // Equipamento foi reparado: danificada → disponivel
          await this.stockService.cancelarDano(manager, equipment.id, quantidade);
        } else if (tipo === 'PERDA') {
          // Equipamento foi recuperado: perdida → disponivel
          await this.stockService.cancelarPerda(manager, equipment.id, quantidade);
        } else if (tipo === 'AJUSTE') {
          await this.stockService.ajustarEstoque(manager, equipment.id, -quantidade);
        }
      } else if (status === 'PENDENTE') {
        // ✅ CORRIGIDO: Para DANO/PERDA pendentes, o estoque JÁ foi ajustado na devolução.
        // Cancelar a ocorrência pendente significa que o item foi revisado e está OK.
        // Nenhuma ação adicional de estoque é necessária, pois o write-off já ocorreu.
        // Se o item foi de fato recuperado/reparado, a ocorrência deve ser primeiro
        // confirmada (BAIXADO) e então cancelada para restaurar o estoque.
        if (tipo === 'AJUSTE') {
          await this.stockService.ajustarEstoque(manager, equipment.id, -quantidade);
        }
        // DANO/PERDA pendentes: no-op (estoque já foi ajustado na devolução)
      }

      occurrence.status = 'CANCELADO';
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