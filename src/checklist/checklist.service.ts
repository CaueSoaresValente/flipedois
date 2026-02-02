import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Checklist } from './checklist.entity';
import { ChecklistItem } from '../checklist-item/checklist-item.entity';
import { Equipment } from '../equipment/equipment.entity';

@Injectable()
export class ChecklistService {
  constructor(
    @InjectRepository(Checklist)
    private readonly checklistRepository: Repository<Checklist>,

    @InjectRepository(ChecklistItem)
    private readonly checklistItemRepository: Repository<ChecklistItem>,

    @InjectRepository(Equipment)
    private readonly equipmentRepository: Repository<Equipment>,
  ) {}

  // ==============================
  // CREATE
  // ==============================
  async create(nome: string) {
    if (!nome || nome.trim().length === 0) {
      throw new BadRequestException('Nome do checklist é obrigatório');
    }

    const checklist = this.checklistRepository.create({
      nome,
      status: 'rascunho',
    });

    return this.checklistRepository.save(checklist);
  }

  // ==============================
  // LISTAR
  // ==============================
  async findAll() {
    return this.checklistRepository.find({
      relations: ['items'],
    });
  }

  // ==============================
  // LIBERAR (BAIXA ESTOQUE AQUI)
  // ==============================
  async liberar(id: number) {
    const checklist = await this.checklistRepository.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!checklist) {
      throw new BadRequestException('Checklist não encontrado');
    }

    if (checklist.status !== 'rascunho') {
      throw new BadRequestException('Checklist não pode ser liberado');
    }

    if (!checklist.items || checklist.items.length === 0) {
      throw new BadRequestException(
        'Checklist precisa ter ao menos um item para ser liberado',
      );
    }

    // 🔹 AGRUPA QUANTIDADE POR EQUIPAMENTO
    const mapa = new Map<number, number>();

    for (const item of checklist.items) {
      const atual = mapa.get(item.equipmentId) ?? 0;
      mapa.set(item.equipmentId, atual + item.quantidadePlanejada);
    }

    // 🔹 VALIDA ESTOQUE
    for (const [equipmentId, quantidade] of mapa.entries()) {
      const equipment = await this.equipmentRepository.findOne({
        where: { id: equipmentId },
      });

      if (!equipment) {
        throw new BadRequestException('Equipamento não encontrado');
      }

      if (quantidade > equipment.quantidadeDisponivel) {
        throw new BadRequestException(
          `Estoque insuficiente para ${equipment.nome}. Disponível: ${equipment.quantidadeDisponivel}`,
        );
      }
    }

    // 🔻 BAIXA ESTOQUE
    for (const [equipmentId, quantidade] of mapa.entries()) {
      const equipment = await this.equipmentRepository.findOne({
        where: { id: equipmentId },
      });

      if (!equipment) {
        throw new BadRequestException('Equipamento não encontrado');
      }

      equipment.quantidadeDisponivel -= quantidade;
      await this.equipmentRepository.save(equipment);
    }

    checklist.status = 'liberado';
    return this.checklistRepository.save(checklist);
  }

  // ==============================
  // CLONAR CHECKLIST
  // ==============================
  async clonar(checklistId: number) {
    const checklistOriginal = await this.checklistRepository.findOne({
      where: { id: checklistId },
      relations: ['items'],
    });

    if (!checklistOriginal) {
      throw new BadRequestException('Checklist não encontrado');
    }

    const novoChecklist = this.checklistRepository.create({
      nome: `${checklistOriginal.nome} (cópia)`,
      status: 'rascunho',
    });

    const checklistSalvo = await this.checklistRepository.save(novoChecklist);

    const alertas: string[] = [];

    for (const item of checklistOriginal.items) {
      const equipment = await this.equipmentRepository.findOne({
        where: { id: item.equipmentId },
      });

      if (!equipment) {
        alertas.push(`Equipamento "${item.nomeSnapshot}" não existe mais`);
        continue;
      }

      if (item.quantidadePlanejada > equipment.quantidadeDisponivel) {
        alertas.push(
          `${equipment.nome}: estoque atual ${equipment.quantidadeDisponivel}, solicitado ${item.quantidadePlanejada}`,
        );
      }

      const novoItem = this.checklistItemRepository.create({
        checklistId: checklistSalvo.id,
        equipmentId: equipment.id,
        nomeSnapshot: equipment.nome,
        descricaoSnapshot: equipment.descricao,
        quantidadePlanejada: item.quantidadePlanejada,
        quantidadeSeparada: 0,
        statusSeparacao: 'pendente',
        quantidadeDevolvida: 0,
        statusDevolucao: 'pendente',
      });

      await this.checklistItemRepository.save(novoItem);
    }

    return {
      checklist: checklistSalvo,
      alertas,
    };
  }

  async cancelar(id: number) {
    const checklist = await this.checklistRepository.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!checklist) {
      throw new BadRequestException('Checklist não encontrado');
    }

    if (checklist.status !== 'liberado') {
      throw new BadRequestException(
        'Só é possível cancelar checklists liberados',
      );
    }

    // 🔁 DEVOLVE TODO ESTOQUE
    for (const item of checklist.items) {
      const equipment = await this.equipmentRepository.findOne({
        where: { id: item.equipmentId },
      });

      if (equipment) {
        equipment.quantidadeDisponivel += item.quantidadePlanejada;
        await this.equipmentRepository.save(equipment);
      }
    }

    checklist.status = 'cancelado';
    return this.checklistRepository.save(checklist);
  }
}
