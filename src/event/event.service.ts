import { Event } from './event.entity';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Checklist } from '../checklist/checklist.entity';
import { Repository } from 'typeorm';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventTeamDto } from './dto/create-event-team.dto';
import { UpdateEventTeamDto } from './dto/update-event-team.dto';
import { EventTeam } from './event-team.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class EventService {
  constructor(
    @InjectRepository(Event)
    private repo: Repository<Event>,

    @InjectRepository(Checklist)
    private checklistRepo: Repository<Checklist>,

    @InjectRepository(EventTeam)
    private readonly teamRepo: Repository<EventTeam>,

    private readonly auditLogService: AuditLogService,
  ) { }

  async create(dto: CreateEventDto, userId?: number, userEmail?: string) {
    const event = this.repo.create({
      nome: dto.nome,
      cliente: dto.cliente,
      local: dto.local,
      dataInicio: new Date(dto.dataInicio),
      dataFim: new Date(dto.dataFim),
      observacoes: dto.observacoes,
      equipe: dto.equipe,
    });

    const saved = await this.repo.save(event);

    // If checklistId provided, link it to this event
    if (dto.checklistId) {
      const checklist = await this.checklistRepo.findOne({
        where: { id: dto.checklistId },
      });
      if (checklist) {
        checklist.eventId = saved.id;
        await this.checklistRepo.save(checklist);
      }
    }

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'CREATE',
      'event',
      saved.id,
      { nome: dto.nome, cliente: dto.cliente, local: dto.local },
      `Evento "${dto.nome}" criado`,
    );

    return saved;
  }

  findAll() {
    return this.repo.find({
      relations: ['checklists', 'equipe'],
      order: { dataInicio: 'DESC' },
    });
  }

  async findOne(id: number) {
    const event = await this.repo.findOne({
      where: { id },
      relations: ['checklists', 'checklists.items', 'equipe'],
    });

    if (!event) {
      throw new BadRequestException('Evento não encontrado');
    }

    return event;
  }

  async adicionarEquipe(eventId: number, dto: CreateEventTeamDto) {
    const event = await this.repo.findOne({
      where: { id: eventId },
      relations: ['equipe'],
    });

    if (!event) {
      throw new BadRequestException('Evento não encontrado');
    }

    const membro = this.teamRepo.create({
      nome: dto.nome,
      funcao: dto.funcao,
      event,
    });

    return this.teamRepo.save(membro);
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
