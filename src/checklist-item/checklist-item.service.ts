import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChecklistItem } from './checklist-item.entity';
import { Checklist } from '../checklist/checklist.entity';
import { Equipment } from '../equipment/equipment.entity';
import { ChecklistItemHistoryService } from '../checklist-item-history/checklist-item-history.service';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';

@Injectable()
export class ChecklistItemService {
  constructor(
    @InjectRepository(ChecklistItem)
    private readonly repository: Repository<ChecklistItem>,

    @InjectRepository(Equipment)
    private readonly equipmentRepository: Repository<Equipment>,

    @InjectRepository(Checklist)
    private readonly checklistRepository: Repository<Checklist>,

    private readonly historyService: ChecklistItemHistoryService,
  ) {}

  // ==============================
  // CREATE (ADMIN)
  // ==============================
  async create(data: CreateChecklistItemDto) {
    const checklist = await this.checklistRepository.findOne({
      where: { id: data.checklistId },
    });

    if (!checklist) {
      throw new BadRequestException('Checklist não encontrado');
    }

    if (checklist.status !== 'rascunho') {
      throw new BadRequestException(
        'Checklist não pode ser alterado após liberação',
      );
    }

    const equipment = await this.equipmentRepository.findOne({
      where: { id: data.equipmentId },
    });

    if (!equipment) {
      throw new BadRequestException('Equipamento não encontrado');
    }

    if (!equipment.ativo) {
      throw new BadRequestException('Equipamento está inativo');
    }

    if (data.quantidadePlanejada <= 0) {
      throw new BadRequestException('Quantidade inválida');
    }

    if (
      equipment.origem === 'interno' &&
      data.quantidadePlanejada > equipment.quantidadeDisponivel
    ) {
      throw new BadRequestException(
        `Estoque insuficiente. Disponível: ${equipment.quantidadeDisponivel}`,
      );
    }

    const existing = await this.repository.findOne({
      where: {
        checklistId: data.checklistId,
        equipmentId: data.equipmentId,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Este equipamento já foi adicionado ao checklist',
      );
    }

    const item = this.repository.create({
      checklistId: data.checklistId,
      equipmentId: equipment.id,
      nomeSnapshot: equipment.nome,
      descricaoSnapshot: equipment.descricao,
      quantidadePlanejada: data.quantidadePlanejada,
      setor: data.setor,
    });

    return this.repository.save(item);
  }

  // ==============================
  // LISTAR
  // ==============================
  findAll() {
    return this.repository.find({
      relations: ['checklist'],
    });
  }

  // ==============================
  // SEPARAÇÃO (FUNCIONÁRIO)
  // ==============================
  async separarItem(itemId: number, quantidade: number) {
    const item = await this.repository.findOne({
      where: { id: itemId },
      relations: ['checklist'],
    });

    if (!item) {
      throw new BadRequestException('Item não encontrado');
    }

    if (item.checklist.status !== 'liberado') {
      throw new BadRequestException(
        'Checklist não está liberado para separação',
      );
    }

    if (quantidade <= 0) {
      throw new BadRequestException('Quantidade inválida');
    }

    if (item.quantidadeSeparada + quantidade > item.quantidadePlanejada) {
      throw new BadRequestException(
        `Quantidade máxima permitida: ${item.quantidadePlanejada}`,
      );
    }

    // 🚫 NÃO mexe em estoque aqui
    const anterior = item.quantidadeSeparada;

    item.quantidadeSeparada += quantidade;
    item.statusSeparacao =
      item.quantidadeSeparada === item.quantidadePlanejada
        ? 'separado'
        : 'pendente';

    await this.repository.save(item);

    await this.historyService.registrarSeparacao(
      item.id,
      anterior,
      item.quantidadeSeparada,
    );

    // 🔥 ATUALIZA STATUS DO CHECKLIST
    await this.atualizarStatusChecklist(item.checklistId);

    // 🔥 RECARREGA O CHECKLIST ATUALIZADO (CORREÇÃO DO SEU BUG)
    const checklistAtualizado = await this.checklistRepository.findOne({
      where: { id: item.checklistId },
    });

    return {
      ...item,
      checklist: checklistAtualizado,
    };
  }

  // ==============================
  // DEVOLUÇÃO (FUNCIONÁRIO)
  // ==============================
  async devolverItem(itemId: number, quantidade: number) {
    const item = await this.repository.findOne({
      where: { id: itemId },
    });

    if (!item) {
      throw new BadRequestException('Item não encontrado');
    }

    if (quantidade <= 0) {
      throw new BadRequestException('Quantidade inválida');
    }

    if (item.quantidadeDevolvida + quantidade > item.quantidadeSeparada) {
      throw new BadRequestException(
        `Máximo para devolução: ${
          item.quantidadeSeparada - item.quantidadeDevolvida
        }`,
      );
    }

    const equipment = await this.equipmentRepository.findOne({
      where: { id: item.equipmentId },
    });

    if (!equipment) {
      throw new BadRequestException('Equipamento não encontrado');
    }

    // 🔺 DEVOLVE AO ESTOQUE (UM POR UM)
    if (equipment.origem === 'interno') {
      equipment.quantidadeDisponivel += quantidade;
    }

    await this.equipmentRepository.save(equipment);

    const anterior = item.quantidadeDevolvida;

    item.quantidadeDevolvida += quantidade;
    item.statusDevolucao =
      item.quantidadeDevolvida === item.quantidadeSeparada
        ? 'devolvido'
        : 'faltando';

    await this.repository.save(item);

    await this.historyService.registrarDevolucao(
      item.id,
      anterior,
      item.quantidadeDevolvida,
    );

    await this.atualizarStatusChecklist(item.checklistId);

    const checklistAtualizado = await this.checklistRepository.findOne({
      where: { id: item.checklistId },
    });

    return {
      ...item,
      checklist: checklistAtualizado,
    };
  }

  // ==============================
  // STATUS AUTOMÁTICO DO CHECKLIST
  // ==============================
  private async atualizarStatusChecklist(checklistId: number) {
    const checklist = await this.checklistRepository.findOne({
      where: { id: checklistId },
      relations: ['items'],
    });

    if (!checklist || !checklist.items.length) return;

    const items = checklist.items;

    const todosSeparados = items.every(
      (i) => i.quantidadeSeparada === i.quantidadePlanejada,
    );

    const algumDevolvido = items.some((i) => i.quantidadeDevolvida > 0);

    const todosDevolvidos = items.every(
      (i) =>
        i.quantidadeSeparada > 0 &&
        i.quantidadeDevolvida === i.quantidadeSeparada,
    );

    if (todosDevolvidos) {
      checklist.status = 'concluido';
    } else if (algumDevolvido) {
      checklist.status = 'pendente_devolucao';
    } else if (todosSeparados) {
      checklist.status = 'em_evento';
    } else {
      checklist.status = 'liberado';
    }

    await this.checklistRepository.save(checklist);
  }

  async updateQuantidade(itemId: number, quantidade: number) {
    if (quantidade <= 0) {
      throw new BadRequestException('Quantidade inválida');
    }

    const item = await this.repository.findOne({
      where: { id: itemId },
      relations: ['checklist'],
    });

    if (!item) {
      throw new BadRequestException('Item não encontrado');
    }

    if (item.checklist.status !== 'rascunho') {
      throw new BadRequestException(
        'Só é possível alterar itens em checklist rascunho',
      );
    }

    const equipment = await this.equipmentRepository.findOne({
      where: { id: item.equipmentId },
    });

    if (!equipment || !equipment.ativo) {
      throw new BadRequestException('Equipamento inválido ou inativo');
    }

    if (
      equipment.origem === 'interno' &&
      quantidade > equipment.quantidadeDisponivel
    ) {
      throw new BadRequestException(
        `Estoque insuficiente. Disponível: ${equipment.quantidadeDisponivel}`,
      );
    }

    item.quantidadePlanejada = quantidade;
    return this.repository.save(item);
  }
  async remove(itemId: number) {
    const item = await this.repository.findOne({
      where: { id: itemId },
      relations: ['checklist'],
    });

    if (!item) {
      throw new BadRequestException('Item não encontrado');
    }

    if (item.checklist.status !== 'rascunho') {
      throw new BadRequestException(
        'Só é possível remover itens em checklist rascunho',
      );
    }

    await this.repository.delete(itemId);
    return { message: 'Item removido com sucesso' };
  }

  async trocarEquipamento(
    itemId: number,
    equipmentId: number,
    quantidade: number,
  ) {
    if (quantidade <= 0) {
      throw new BadRequestException('Quantidade inválida');
    }

    const item = await this.repository.findOne({
      where: { id: itemId },
      relations: ['checklist'],
    });

    if (!item) {
      throw new BadRequestException('Item não encontrado');
    }

    if (item.checklist.status !== 'rascunho') {
      throw new BadRequestException(
        'Só é possível trocar em checklist rascunho',
      );
    }

    const equipment = await this.equipmentRepository.findOne({
      where: { id: equipmentId },
    });

    if (!equipment || !equipment.ativo) {
      throw new BadRequestException('Equipamento inválido ou inativo');
    }

    if (
      equipment.origem === 'interno' &&
      quantidade > equipment.quantidadeDisponivel
    ) {
      throw new BadRequestException(
        `Estoque insuficiente. Disponível: ${equipment.quantidadeDisponivel}`,
      );
    }

    item.equipmentId = equipment.id;
    item.nomeSnapshot = equipment.nome;
    item.descricaoSnapshot = equipment.descricao;
    item.quantidadePlanejada = quantidade;

    return this.repository.save(item);
  }
}
