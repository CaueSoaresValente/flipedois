import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Equipment } from './equipment.entity';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class EquipmentService {
  constructor(
    @InjectRepository(Equipment)
    private readonly repository: Repository<Equipment>,

    private readonly auditLogService: AuditLogService,
  ) {}

  async create(dto: CreateEquipmentDto, userId?: number, userEmail?: string) {
    const origem = dto.origem ?? 'interno';

    if (dto.quantidadeTotal < 0) {
      throw new BadRequestException('Quantidade não pode ser negativa');
    }

    if (dto.quantidadeTotal <= 0) {
      throw new BadRequestException(
        'Quantidade inválida. Deve ser maior que zero.',
      );
    }

    if (origem === 'alugado' && (!dto.fornecedor || dto.fornecedor.trim() === '')) {
      throw new BadRequestException(
        'Equipamento alugado deve ter o nome do fornecedor preenchido.',
      );
    }

    const equipment = this.repository.create({
      nome: dto.nome,
      descricao: dto.descricao,
      quantidadeTotal: dto.quantidadeTotal,
      quantidadeDisponivel: dto.quantidadeTotal,
      origem,
      fornecedor: dto.fornecedor ?? undefined,
      ativo: true,
    });

    const saved = await this.repository.save(equipment);

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'CREATE',
      'equipment',
      saved.id,
      { nome: dto.nome, quantidadeTotal: dto.quantidadeTotal, origem },
      `Equipamento "${dto.nome}" criado`,
    );

    return saved;
  }

  async findAll(page = 1, limit = 20) {
    const [data, total] = await this.repository.findAndCount({
      where: { ativo: true },
      order: { nome: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Fix #1: Search endpoint for autocomplete
  async search(query: string, setor?: string) {
    const where: any = { ativo: true };

    if (query) {
      where.nome = ILike(`%${query}%`);
    }

    return this.repository.find({
      where,
      order: { nome: 'ASC' },
      take: 20,
    });
  }

  // Fix #3: Explicit field mapping instead of Object.assign
  async update(
    id: number,
    dto: UpdateEquipmentDto,
    userId?: number,
    userEmail?: string,
  ) {
    const equipment = await this.repository.findOne({ where: { id } });

    if (!equipment) {
      throw new BadRequestException('Equipamento não encontrado');
    }

    const changes: Record<string, any> = {};

    // emUso is tracked directly — do NOT derive as total - disponivel (ignores danificada/perdida)
    const quantidadeEmUso = equipment.quantidadeEmUso;

    if (dto.quantidadeTotal !== undefined) {
      if (dto.quantidadeTotal < quantidadeEmUso) {
        throw new BadRequestException(
          `Existem ${quantidadeEmUso} unidades em uso. Mínimo permitido: ${quantidadeEmUso}`,
        );
      }

      const diferenca = dto.quantidadeTotal - equipment.quantidadeTotal;
      changes.quantidadeTotal = {
        de: equipment.quantidadeTotal,
        para: dto.quantidadeTotal,
      };
      equipment.quantidadeDisponivel += diferenca;
      equipment.quantidadeTotal = dto.quantidadeTotal;
    }

    if (dto.nome !== undefined) {
      if (dto.nome.trim() === '') {
        throw new BadRequestException('Nome não pode ser vazio');
      }
      changes.nome = { de: equipment.nome, para: dto.nome };
      equipment.nome = dto.nome;
    }

    if (dto.descricao !== undefined) {
      if (dto.descricao.trim() === '') {
        throw new BadRequestException('Descrição não pode ser vazia');
      }
      changes.descricao = { de: equipment.descricao, para: dto.descricao };
      equipment.descricao = dto.descricao;
    }

    if (dto.ativo !== undefined) {
      changes.ativo = { de: equipment.ativo, para: dto.ativo };
      equipment.ativo = dto.ativo;
    }

    if (dto.origem !== undefined) {
      changes.origem = { de: equipment.origem, para: dto.origem };
      equipment.origem = dto.origem;
    }

    if (dto.fornecedor !== undefined) {
      changes.fornecedor = { de: equipment.fornecedor, para: dto.fornecedor };
      equipment.fornecedor = dto.fornecedor;
    }

    // Ensure stock never goes negative
    if (equipment.quantidadeDisponivel < 0) {
      throw new BadRequestException(
        'Estoque disponível não pode ficar negativo',
      );
    }

    const saved = await this.repository.save(equipment);

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'UPDATE',
      'equipment',
      id,
      changes,
      `Equipamento "${equipment.nome}" atualizado`,
    );

    return saved;
  }

  async desativar(id: number, userId?: number, userEmail?: string) {
    const equipment = await this.repository.findOne({ where: { id } });

    if (!equipment) {
      throw new BadRequestException('Equipamento não encontrado');
    }

    equipment.ativo = false;
    const saved = await this.repository.save(equipment);

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'DESATIVAR',
      'equipment',
      id,
      { ativo: false },
      `Equipamento "${equipment.nome}" desativado`,
    );

    return saved;
  }

  async excluirPermanente(id: number, userId?: number, userEmail?: string) {
    const equipment = await this.repository.findOne({ where: { id } });

    if (!equipment) {
      throw new BadRequestException('Equipamento não encontrado.');
    }

    // Verificar se o equipamento está em algum checklist ativo
    const checklistItemRepo = this.repository.manager.getRepository('ChecklistItem');
    const itemsInChecklists = await checklistItemRepo
      .createQueryBuilder('item')
      .innerJoin('item.checklist', 'checklist')
      .where('item.equipmentId = :id', { id })
      .andWhere('checklist.status NOT IN (:...statuses)', { statuses: ['concluido', 'cancelado'] })
      .getCount();

    if (itemsInChecklists > 0) {
      throw new BadRequestException(
        `Este equipamento está sendo usado em ${itemsInChecklists} checklist(s) ativo(s). Não é possível excluir.`,
      );
    }

    const nome = equipment.nome;
    await this.repository.remove(equipment);

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'DELETE',
      'equipment',
      id,
      { nome },
      `Equipamento "${nome}" excluído permanentemente`,
    );

    return { message: `Equipamento "${nome}" excluído permanentemente.` };
  }
}
