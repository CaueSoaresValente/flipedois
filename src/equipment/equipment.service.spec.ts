import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Equipment } from './equipment.entity';
import { CreateEquipmentDto } from './dto/create-equipment.dto';

@Injectable()
export class EquipmentService {
  constructor(
    @InjectRepository(Equipment)
    private readonly repository: Repository<Equipment>,
  ) {}

  async create(dto: CreateEquipmentDto) {
    const equipment = this.repository.create({
      nome: dto.nome,
      descricao: dto.descricao,
      quantidadeTotal: dto.quantidadeTotal,
      quantidadeDisponivel: dto.quantidadeTotal,
      ativo: true,
    });

    return this.repository.save(equipment);
  }

  async findAll() {
    return this.repository.find({
      where: { ativo: true },
      order: { nome: 'ASC' },
    });
  }
}
