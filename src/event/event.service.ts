import { Event } from './event.entity';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Checklist } from 'src/checklist/checklist.entity';
import { Repository } from 'typeorm';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventTeamDto } from './dto/create-event-team.dto';
import { UpdateEventTeamDto } from './dto/update-event-team.dto';
import { EventTeam } from './event-team.entity';
import { Equipment } from 'src/equipment/equipment.entity';
import { EquipmentReservation } from '../equipment/equipment-reservation.entity';


@Injectable()
export class EventService {
  constructor(
    @InjectRepository(Event)
    private repo: Repository<Event>,

    @InjectRepository(Checklist)
    private checklistRepo: Repository<Checklist>,

    @InjectRepository(EventTeam)
    private readonly teamRepo: Repository<EventTeam>,

    @InjectRepository(Equipment)
    private equipmentRepo: Repository<Equipment>,

    @InjectRepository(EquipmentReservation)
    private reservationRepo: Repository<EquipmentReservation>,
  ) { }

  async create(dto: CreateEventDto) {
    const checklist = await this.checklistRepo.findOne({
      where: { id: dto.checklistId },
    });

    if (!checklist) {
      throw new BadRequestException('Checklist não encontrado');
    }

    const event = this.repo.create({
      nome: dto.nome,
      cliente: dto.cliente,
      local: dto.local,
      dataInicio: new Date(dto.dataInicio),
      dataFim: new Date(dto.dataFim),
      observacoes: dto.observacoes,
      checklist,
      equipe: dto.equipe,
    });

    return this.repo.save(event);
  }

  private async criarReservas(event: Event) {
    const checklist = await this.checklistRepo.findOne({
      where: { id: event.checklist.id },
      relations: ['items'],
    });

    for (const item of checklist.items) {
      await this.validarDisponibilidade(
        item.equipmentId,
        item.quantidadePlanejada,
        event.dataInicio,
        event.dataFim,
      );

      await this.reservationRepo.save({
        equipmentId: item.equipmentId,
        checklistId: checklist.id,
        quantidade: item.quantidadePlanejada,
        dataInicio: event.dataInicio,
        dataFim: event.dataFim,
      });
    }
  }

  private async validarDisponibilidade(
    equipmentId: number,
    quantidade: number,
    inicio: Date,
    fim: Date,
  ) {
    const equipment = await this.equipmentRepo.findOne({
      where: { id: equipmentId },
    });

    if (!equipment) {
      throw new BadRequestException('Equipamento não encontrado');
    }

    const reservas = await this.reservationRepo
      .createQueryBuilder('r')
      .where('r.equipmentId = :equipmentId', { equipmentId })
      .andWhere(
        '(r.dataInicio <= :fim AND r.dataFim >= :inicio)',
        { inicio, fim },
      )
      .getMany();

    const reservado = reservas.reduce(
      (total, r) => total + r.quantidade,
      0,
    );

    const disponivel = equipment.quantidadeTotal - reservado;

    if (quantidade > disponivel) {
      throw new BadRequestException(
        `Conflito de agenda: disponível ${disponivel}`,
      );
    }
  }


  findAll() {
    return this.repo.find({
      relations: ['checklist', 'equipe'],
    });
  }

  async adicionarEquipe(eventId: number, dto: CreateEventTeamDto) {
    const event = await this.repo.findOne({
      where: { id: eventId },
      relations: ['equipe'],
    });

    if (!event) {
      throw new BadRequestException('Evento não encontrado');
    }

    const membro = {
      nome: dto.nome,
      funcao: dto.funcao,
    };

    event.equipe.push(membro as any);

    return this.repo.save(event);
  }

  async listarEquipe(eventId: number) {
    const event = await this.repo.findOne({
      where: { id: eventId },
      relations: ['equipe'],
    });

    if (!event) {
      throw new BadRequestException('Evento não encontrado');
    }

    return event.equipe;
  }

  async editarEquipe(id: number, dto: UpdateEventTeamDto) {
    const membro = await this.teamRepo.findOne({
      where: { id },
    });

    if (!membro) {
      throw new BadRequestException('Membro não encontrado');
    }

    if (dto.nome !== undefined) {
      membro.nome = dto.nome;
    }

    if (dto.funcao !== undefined) {
      membro.funcao = dto.funcao;
    }

    return this.teamRepo.save(membro);
  }

  async removerEquipe(id: number) {
    const membro = await this.teamRepo.findOne({
      where: { id },
    });

    if (!membro) {
      throw new BadRequestException('Membro não encontrado');
    }

    await this.teamRepo.delete(id);

    return { message: 'Membro removido com sucesso' };
  }
}
