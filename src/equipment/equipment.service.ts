import { BadRequestException, Injectable } from '@nestjs/common';
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
   if (dto.quantidadeTotal <= 0) {
    throw new BadRequestException('Quantidade total deve ser maior que zero');
  }


    const equipment = this.repository.create({
      nome: dto.nome,
      descricao: dto.descricao,
      quantidadeTotal: dto.quantidadeTotal,
      quantidadeDisponivel: dto.quantidadeTotal, // 🔒 REGRA DE NEGÓCIO
      ativo: true,
    });

    return this.repository.save(equipment);
  }

  async findAll() {
    return this.repository.find({
      order: { nome: 'ASC' },
    });
  }
}
