import { Event } from './event.entity';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Checklist } from 'src/checklist/checklist.entity';
import { Repository } from 'typeorm';
import { CreateEventDto } from './dto/create-event.dto';

@Injectable()
export class EventService {
  constructor(
    @InjectRepository(Event)
    private repo: Repository<Event>,

    @InjectRepository(Checklist)
    private checklistRepo: Repository<Checklist>,
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
}
