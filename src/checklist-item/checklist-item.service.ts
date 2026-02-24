import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChecklistItem } from './checklist-item.entity';
import { Checklist } from '../checklist/checklist.entity';
import { Equipment } from '../equipment/equipment.entity';
import { ChecklistItemHistoryService } from '../checklist-item-history/checklist-item-history.service';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { Event } from '../event/event.entity';

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

    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
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

    if (!item) throw new BadRequestException('Item não encontrado');

    if (item.checklist.status === 'cancelado') {
      throw new BadRequestException('Checklist cancelado');
    }

    if (item.checklist.status !== 'liberado') {
      throw new BadRequestException('Checklist não liberado');
    }

    if (quantidade <= 0) {
      throw new BadRequestException('Quantidade inválida');
    }

    if (item.quantidadeSeparada + quantidade > item.quantidadePlanejada) {
      throw new BadRequestException('Excede quantidade planejada');
    }

    const equipment = await this.equipmentRepository.findOne({
      where: { id: item.equipmentId },
    });

    if (!equipment) {
      throw new BadRequestException('Equipamento não encontrado');
    }

    // 🔥 BLOQUEAR SE NÃO HÁ ESTOQUE
    if (
      equipment.origem === 'interno' &&
      quantidade > equipment.quantidadeDisponivel
    ) {
      throw new BadRequestException(
        `Estoque disponível: ${equipment.quantidadeDisponivel}`,
      );
    }

    const anterior = item.quantidadeSeparada;

    // 🔥 BAIXAR ESTOQUE
    if (equipment.origem === 'interno') {
      equipment.quantidadeDisponivel -= quantidade;
      await this.equipmentRepository.save(equipment);
    }

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

    await this.atualizarStatusChecklist(item.checklistId);

    // mensagem inteligente
    let aviso = '';

    if (item.quantidadeSeparada === 0) {
      aviso = 'Item ainda não separado';
    } else if (item.quantidadeSeparada < item.quantidadePlanejada) {
      aviso = `Separação parcial: ${item.quantidadeSeparada}/${item.quantidadePlanejada}`;
    } else {
      aviso = 'Item totalmente separado';
    }

    const checklistAtualizado = await this.checklistRepository.findOne({
      where: { id: item.checklistId },
    });

    const alerta = await this.verificarConflitoEventos(
      item.equipmentId,
      item.checklistId,
    );

    return {
      aviso,
      alerta,
      item,
      checklist: checklistAtualizado,
    };
  }

  // ==============================
  // DEVOLUÇÃO (FUNCIONÁRIO)
  // ==============================
  async devolverItem(
    itemId: number,
    quantidade: number,
    situacao: 'ok' | 'quebrado' | 'perdido',
  ) {
    const item = await this.repository.findOne({
      where: { id: itemId },
    });

    if (!item) throw new BadRequestException('Item não encontrado');

    if (quantidade <= 0) throw new BadRequestException('Quantidade inválida');

    if (item.quantidadeDevolvida + quantidade > item.quantidadeSeparada) {
      throw new BadRequestException('Quantidade excede separação');
    }

    const equipment = await this.equipmentRepository.findOne({
      where: { id: item.equipmentId },
    });

    if (!equipment) throw new BadRequestException('Equipamento não encontrado');

    const anterior = item.quantidadeDevolvida;

    item.quantidadeDevolvida += quantidade;

    // 🔥 REGRA REAL
    if (situacao === 'ok' && equipment.origem === 'interno') {
      equipment.quantidadeDisponivel += quantidade;
      await this.equipmentRepository.save(equipment);
    }

    // status final
    if (item.quantidadeDevolvida === item.quantidadeSeparada) {
      if (situacao === 'ok') item.statusDevolucao = 'devolvido';
      if (situacao === 'quebrado') item.statusDevolucao = 'quebrado';
      if (situacao === 'perdido') item.statusDevolucao = 'perdido';
    } else {
      item.statusDevolucao = 'faltando';
    }

    await this.repository.save(item);

    await this.historyService.registrarDevolucao(
      item.id,
      anterior,
      item.quantidadeDevolvida,
    );

    await this.atualizarStatusChecklist(item.checklistId);

    return {
      mensagem:
        situacao === 'ok'
          ? 'Item devolvido ao estoque'
          : situacao === 'quebrado'
            ? 'Item registrado como quebrado'
            : 'Item registrado como perdido',
      item,
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

    const todosFinalizados = items.every(
      (i) =>
        i.quantidadeSeparada > 0 &&
        ['devolvido', 'quebrado', 'perdido'].includes(i.statusDevolucao),
    );

    if (todosFinalizados) {
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

  async cancelarSeparacao(itemId: number, quantidade: number) {
    const item = await this.repository.findOne({
      where: { id: itemId },
      relations: ['checklist'],
    });

    if (!item) throw new BadRequestException('Item não encontrado');

    if (quantidade <= 0) {
      throw new BadRequestException('Quantidade inválida');
    }

    const disponivelParaCancelar =
      item.quantidadeSeparada - item.quantidadeDevolvida;

    if (quantidade > disponivelParaCancelar) {
      throw new BadRequestException(
        `Só é possível cancelar ${disponivelParaCancelar}`,
      );
    }

    const equipment = await this.equipmentRepository.findOne({
      where: { id: item.equipmentId },
    });

    if (!equipment) {
      throw new BadRequestException('Equipamento não encontrado');
    }

    if (item.checklist.status === 'em_evento') {
      throw new BadRequestException(
        'Não é possível cancelar separação durante o evento',
      );
    }

    const anterior = item.quantidadeSeparada;

    // 🔥 DEVOLVER ESTOQUE
    if (equipment.origem === 'interno') {
      equipment.quantidadeDisponivel += quantidade;
      await this.equipmentRepository.save(equipment);
    }

    // 🔥 REDUZIR SEPARAÇÃO
    item.quantidadeSeparada -= quantidade;

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

    await this.atualizarStatusChecklist(item.checklistId);

    return {
      mensagem: 'Separação cancelada com sucesso',
      item,
    };
  }

  private async verificarConflitoEventos(
    equipmentId: number,
    checklistId: number,
  ) {
    const eventoAtual = await this.eventRepository.findOne({
      where: { checklist: { id: checklistId } },
    });

    if (!eventoAtual) return null;

    const outrosEventos = await this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.checklist', 'checklist')
      .leftJoinAndSelect('checklist.items', 'items')
      .where('event.id != :id', { id: eventoAtual.id })
      .andWhere('(event.dataInicio <= :fim AND event.dataFim >= :inicio)', {
        inicio: eventoAtual.dataInicio,
        fim: eventoAtual.dataFim,
      })
      .andWhere('items.equipmentId = :equipmentId', { equipmentId })
      .getMany();

    if (!outrosEventos.length) return null;

    return '⚠ Este equipamento também está planejado para outro evento próximo';
  }
}
