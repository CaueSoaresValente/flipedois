import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Equipment } from '../equipment/equipment.entity';
import { Checklist } from '../checklist/checklist.entity';
import { Event } from '../event/event.entity';
import { EquipmentOccurrence } from '../equipment-occurrence/equipment-occurrence.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Equipment)
    private equipmentRepo: Repository<Equipment>,

    @InjectRepository(Checklist)
    private checklistRepo: Repository<Checklist>,

    @InjectRepository(Event)
    private eventRepo: Repository<Event>,

    @InjectRepository(EquipmentOccurrence)
    private occurrenceRepo: Repository<EquipmentOccurrence>,
  ) {}

  async getStats() {
    const equipamentos = await this.equipmentRepo.find({
      where: { ativo: true },
    });
    const totalEquipamentos = equipamentos.length;
    const emUso = equipamentos.reduce(
      (acc, eq) => acc + (eq.quantidadeEmUso ?? 0),
      0,
    );
    const disponiveis = equipamentos.reduce(
      (acc, eq) => acc + eq.quantidadeDisponivel,
      0,
    );
    const estoqueBaixo = equipamentos.filter(
      (eq) => eq.origem === 'interno' && eq.quantidadeDisponivel <= 2,
    );

    const eventos = await this.eventRepo.count();
    const eventosAtivos = await this.eventRepo
      .createQueryBuilder('event')
      .where('event.dataFim >= :now', { now: new Date() })
      .getCount();

    const checklists = await this.checklistRepo.find();
    const checklistsPorStatus: Record<string, number> = {};
    for (const cl of checklists) {
      checklistsPorStatus[cl.status] =
        (checklistsPorStatus[cl.status] ?? 0) + 1;
    }

    const ocorrenciasPendentes = await this.occurrenceRepo.count({
      where: { status: 'PENDENTE' },
    });

    return {
      equipamentos: {
        total: totalEquipamentos,
        unidadesEmUso: emUso,
        unidadesDisponiveis: disponiveis,
        estoqueBaixo: estoqueBaixo.map((eq) => ({
          id: eq.id,
          nome: eq.nome,
          disponivel: eq.quantidadeDisponivel,
          total: eq.quantidadeTotal,
        })),
      },
      eventos: {
        total: eventos,
        ativos: eventosAtivos,
      },
      checklists: {
        total: checklists.length,
        porStatus: checklistsPorStatus,
      },
      ocorrencias: {
        pendentes: ocorrenciasPendentes,
      },
    };
  }
}
