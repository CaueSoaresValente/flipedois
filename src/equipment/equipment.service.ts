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

  async update(id: number, dto: UpdateEquipmentDto) {
    const equipment = await this.repository.findOne({
      where: { id },
    });

    if (!equipment) {
      throw new BadRequestException('Equipamento não encontrado');
    }

    const quantidadeEmUso =
      equipment.quantidadeTotal - equipment.quantidadeDisponivel;

    // Se tentou mudar quantidade total
    if (dto.quantidadeTotal !== undefined) {
      if (dto.quantidadeTotal < quantidadeEmUso) {
        throw new BadRequestException(
          `Não é possível reduzir estoque. Existem ${quantidadeEmUso} unidades já em uso em eventos.`,
        );
      }

      const diferenca = dto.quantidadeTotal - equipment.quantidadeTotal;

      // Ajusta disponível proporcionalmente
      equipment.quantidadeDisponivel += diferenca;
      equipment.quantidadeTotal = dto.quantidadeTotal;
    }

    if (dto.nome !== undefined) {
      equipment.nome = dto.nome;
    }

    if (dto.descricao !== undefined) {
      equipment.descricao = dto.descricao;
    }

    if (dto.ativo !== undefined) {
      equipment.ativo = dto.ativo;
    }

    return this.repository.save(equipment);
  }
}
