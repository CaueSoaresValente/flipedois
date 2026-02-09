import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Equipment } from './equipment.entity';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';

@Injectable()
export class EquipmentService {
  constructor(
    @InjectRepository(Equipment)
    private readonly repository: Repository<Equipment>,
  ) {}

  async create(dto: CreateEquipmentDto) {
    if (dto.quantidadeTotal <= 0 && dto.origem === 'interno') {
      throw new BadRequestException('Quantidade inválida');
    }

    const origem = dto.origem ?? 'interno';

    const equipment = this.repository.create({
      nome: dto.nome,
      descricao: dto.descricao,
      quantidadeTotal: origem === 'interno' ? dto.quantidadeTotal : 0,
      quantidadeDisponivel: origem === 'interno' ? dto.quantidadeTotal : 0,
      origem,
      fornecedor: dto.fornecedor,
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

  async update(id: number, dto: UpdateEquipmentDto) {
    const equipment = await this.repository.findOne({ where: { id } });

    if (!equipment) {
      throw new BadRequestException('Equipamento não encontrado');
    }

    const quantidadeEmUso =
      equipment.quantidadeTotal - equipment.quantidadeDisponivel;

    if (dto.quantidadeTotal !== undefined) {
      if (dto.quantidadeTotal < quantidadeEmUso) {
        throw new BadRequestException(
          `Existem ${quantidadeEmUso} unidades em uso`,
        );
      }

      const diferenca = dto.quantidadeTotal - equipment.quantidadeTotal;
      equipment.quantidadeDisponivel += diferenca;
      equipment.quantidadeTotal = dto.quantidadeTotal;
    }

    if (dto.nome !== undefined && dto.nome.trim() === '') {
      throw new BadRequestException('Nome não pode ser vazio');
    }

    if (dto.descricao !== undefined && dto.descricao.trim() === '') {
      throw new BadRequestException('Descrição não pode ser vazia');
    }

    Object.assign(equipment, dto);
    return this.repository.save(equipment);
  }

  async desativar(id: number) {
    const equipment = await this.repository.findOne({ where: { id } });

    if (!equipment) {
      throw new BadRequestException('Equipamento não encontrado');
    }

    equipment.ativo = false;
    return this.repository.save(equipment);
  }
}
