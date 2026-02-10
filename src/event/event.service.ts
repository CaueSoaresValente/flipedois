import { Event } from './event.entity';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Checklist } from 'src/checklist/checklist.entity';
import { Repository } from 'typeorm';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventTeamDto } from './dto/create-event-team.dto';
import { UpdateEventTeamDto } from './dto/update-event-team.dto';
import { EventTeam } from './event-team.entity';

@Injectable()
export class EventService {
  constructor(
    @InjectRepository(Event)
    private repo: Repository<Event>,

    @InjectRepository(Checklist)
    private checklistRepo: Repository<Checklist>,

    @InjectRepository(EventTeam)
    private readonly teamRepo: Repository<EventTeam>,
  ) {}

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
