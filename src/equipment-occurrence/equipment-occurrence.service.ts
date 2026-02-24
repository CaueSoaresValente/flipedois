import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { EquipmentOccurrence } from './equipment-occurrence.entity';
import { Equipment } from '../equipment/equipment.entity';
import { Event } from '../event/event.entity';

@Injectable()
export class EquipmentOccurrenceService {
  constructor(
    @InjectRepository(EquipmentOccurrence)
    private repo: Repository<EquipmentOccurrence>,

    @InjectRepository(Equipment)
    private equipmentRepo: Repository<Equipment>,

    @InjectRepository(Event)
    private eventRepo: Repository<Event>,
  ) {}

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

  if (!equipment) throw new BadRequestException('Equipamento não encontrado');

  let event: Event | null = null;

  if (eventId) {
    event = await this.eventRepo.findOne({ where: { id: eventId } });

    if (!event) throw new BadRequestException('Evento não encontrado');
  }

  if (quantidade <= 0) {
    throw new BadRequestException('Quantidade inválida');
  }

  if (tipo === 'AJUSTE' && !motivo) {
    throw new BadRequestException(
      'Motivo é obrigatório para ajuste de estoque',
    );
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

  async confirmarBaixa(id: number) {
  const occurrence = await this.repo.findOne({ where: { id } });

  if (!occurrence) {
    throw new BadRequestException('Ocorrência não encontrada');
  }

  if (occurrence.status !== 'PENDENTE') {
    throw new BadRequestException('Ocorrência já processada');
  }

  const equipment = await this.equipmentRepo.findOne({
    where: { id: occurrence.equipment.id },
  });

  if (!equipment) {
    throw new BadRequestException('Equipamento não encontrado');
  }

  let quantidade = occurrence.quantidade;

  if (occurrence.tipo === 'AJUSTE') {
    // Ajuste pode ser positivo ou negativo
    equipment.quantidadeTotal += quantidade;
    equipment.quantidadeDisponivel += quantidade;

    if (equipment.quantidadeTotal < 0 || equipment.quantidadeDisponivel < 0) {
      throw new BadRequestException('Estoque inválido após ajuste');
    }
  } else {
    // DANO ou PERDA → baixa estoque
    if (equipment.quantidadeTotal < quantidade) {
      throw new BadRequestException('Estoque insuficiente');
    }

    equipment.quantidadeTotal -= quantidade;

    if (equipment.quantidadeDisponivel >= quantidade) {
      equipment.quantidadeDisponivel -= quantidade;
    } else {
      equipment.quantidadeDisponivel = 0;
    }
  }

  await this.equipmentRepo.save(equipment);

  occurrence.status = 'BAIXADO';
  return this.repo.save(occurrence);
}

  async cancelar(id: number) {
  const occurrence = await this.repo.findOne({ where: { id } });

  if (!occurrence) {
    throw new BadRequestException('Ocorrência não encontrada');
  }

  if (occurrence.status !== 'PENDENTE') {
    throw new BadRequestException(
      'Não é possível cancelar ocorrência já processada',
    );
  }

  occurrence.status = 'CANCELADO';
  return this.repo.save(occurrence);
}

findAll() {
  return this.repo.find({
    order: { createdAt: 'DESC' },
  });
}
}