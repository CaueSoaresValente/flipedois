import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ChecklistItem } from './checklist-item.entity';
import { Checklist } from '../checklist/checklist.entity';
import { Equipment } from '../equipment/equipment.entity';
import { ChecklistItemHistoryService } from '../checklist-item-history/checklist-item-history.service';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { Event } from '../event/event.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

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

    private readonly dataSource: DataSource,
    private readonly auditLogService: AuditLogService,
  ) { }

  // ==============================
  // CREATE (ADMIN)
  // ==============================
  async create(data: CreateChecklistItemDto, userId?: number, userEmail?: string) {
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

    // Fix #2: Block addition without sufficient stock
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

    const saved = await this.repository.save(item);

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'CREATE',
      'checklist_item',
      saved.id,
      { checklistId: data.checklistId, equipmentId: data.equipmentId, quantidade: data.quantidadePlanejada },
      `Item "${equipment.nome}" adicionado ao checklist`,
    );

    return saved;
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
  // SEPARAÇÃO (FUNCIONÁRIO) — with transaction
  // ==============================
  async separarItem(itemId: number, quantidade: number, userId?: number, userEmail?: string) {
    return this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(ChecklistItem, {
        where: { id: itemId },
        relations: ['checklist'],
      });

      if (!item) throw new BadRequestException('Item não encontrado');

      if (item.checklist.status === 'cancelado') {
        throw new BadRequestException('Checklist cancelado');
      }

      if (item.checklist.status !== 'liberado') {
        throw new BadRequestException('Checklist não liberado para separação');
      }

      if (quantidade <= 0) {
        throw new BadRequestException('Quantidade inválida');
      }

      if (item.quantidadeSeparada + quantidade > item.quantidadePlanejada) {
        throw new BadRequestException(
          `Excede quantidade planejada. Máximo: ${item.quantidadePlanejada - item.quantidadeSeparada}`,
        );
      }

      const equipment = await manager.findOne(Equipment, {
        where: { id: item.equipmentId },
      });

      if (!equipment) {
        throw new BadRequestException('Equipamento não encontrado');
      }

      // Block if no stock available
      if (
        equipment.origem === 'interno' &&
        quantidade > equipment.quantidadeDisponivel
      ) {
        throw new BadRequestException(
          `Estoque insuficiente. Disponível: ${equipment.quantidadeDisponivel}`,
        );
      }

      const anterior = item.quantidadeSeparada;

      // Deduct stock within transaction
      if (equipment.origem === 'interno') {
        equipment.quantidadeDisponivel -= quantidade;
        if (equipment.quantidadeDisponivel < 0) {
          throw new BadRequestException('Estoque não pode ficar negativo');
        }
        await manager.save(Equipment, equipment);
      }

      item.quantidadeSeparada += quantidade;

      item.statusSeparacao =
        item.quantidadeSeparada === item.quantidadePlanejada
          ? 'separado'
          : 'pendente';

      await manager.save(ChecklistItem, item);

      await this.historyService.registrarSeparacao(
        item.id,
        anterior,
        item.quantidadeSeparada,
        userEmail ?? 'sistema',
      );

      await this.atualizarStatusChecklistTx(manager, item.checklistId);

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'SEPARAR',
        'checklist_item',
        item.id,
        {
          equipmentId: item.equipmentId,
          equipmentNome: item.nomeSnapshot,
          quantidadeAnterior: anterior,
          quantidadeNova: item.quantidadeSeparada,
          quantidadePlanejada: item.quantidadePlanejada,
        },
        `Separado ${quantidade}x "${item.nomeSnapshot}"`,
      );

      // Smart feedback message
      let aviso = '';

      if (item.quantidadeSeparada === 0) {
        aviso = 'Item ainda não separado';
      } else if (item.quantidadeSeparada < item.quantidadePlanejada) {
        aviso = `Separação parcial: ${item.quantidadeSeparada}/${item.quantidadePlanejada}`;
      } else {
        aviso = 'Item totalmente separado';
      }

      const checklistAtualizado = await manager.findOne(Checklist, {
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
    });
  }

  // ==============================
  // DEVOLUÇÃO (FUNCIONÁRIO) — with transaction
  // ==============================
  async devolverItem(
    itemId: number,
    quantidade: number,
    situacao: 'ok' | 'quebrado' | 'perdido',
    userId?: number,
    userEmail?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(ChecklistItem, {
        where: { id: itemId },
      });

      if (!item) throw new BadRequestException('Item não encontrado');

      if (quantidade <= 0) throw new BadRequestException('Quantidade inválida');

      if (item.quantidadeDevolvida + quantidade > item.quantidadeSeparada) {
        throw new BadRequestException(
          `Quantidade excede separação. Máximo: ${item.quantidadeSeparada - item.quantidadeDevolvida}`,
        );
      }

      const equipment = await manager.findOne(Equipment, {
        where: { id: item.equipmentId },
      });

      if (!equipment) throw new BadRequestException('Equipamento não encontrado');

      const anterior = item.quantidadeDevolvida;

      item.quantidadeDevolvida += quantidade;

      // Only return stock for items in OK condition
      if (situacao === 'ok' && equipment.origem === 'interno') {
        equipment.quantidadeDisponivel += quantidade;
        await manager.save(Equipment, equipment);
      }

      // Set final status
      if (item.quantidadeDevolvida === item.quantidadeSeparada) {
        if (situacao === 'ok') item.statusDevolucao = 'devolvido';
        if (situacao === 'quebrado') item.statusDevolucao = 'quebrado';
        if (situacao === 'perdido') item.statusDevolucao = 'perdido';
      } else {
        item.statusDevolucao = 'faltando';
      }

      await manager.save(ChecklistItem, item);

      await this.historyService.registrarDevolucao(
        item.id,
        anterior,
        item.quantidadeDevolvida,
        userEmail ?? 'sistema',
      );

      await this.atualizarStatusChecklistTx(manager, item.checklistId);

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'DEVOLVER',
        'checklist_item',
        item.id,
        {
          equipmentId: item.equipmentId,
          equipmentNome: item.nomeSnapshot,
          situacao,
          quantidadeAnterior: anterior,
          quantidadeNova: item.quantidadeDevolvida,
        },
        `Devolvido ${quantidade}x "${item.nomeSnapshot}" (${situacao})`,
      );

      return {
        mensagem:
          situacao === 'ok'
            ? 'Item devolvido ao estoque'
            : situacao === 'quebrado'
              ? 'Item registrado como quebrado'
              : 'Item registrado como perdido',
        item,
      };
    });
  }

  // ==============================
  // STATUS AUTOMÁTICO DO CHECKLIST (transaction-aware)
  // ==============================
  private async atualizarStatusChecklistTx(manager: any, checklistId: number) {
    const checklist = await manager.findOne(Checklist, {
      where: { id: checklistId },
      relations: ['items'],
    });

    if (!checklist || !checklist.items.length) return;

    const items = checklist.items;

    const todosSeparados = items.every(
      (i: ChecklistItem) => i.quantidadeSeparada === i.quantidadePlanejada,
    );

    const algumDevolvido = items.some((i: ChecklistItem) => i.quantidadeDevolvida > 0);

    const todosFinalizados = items.every(
      (i: ChecklistItem) =>
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

    await manager.save(Checklist, checklist);
  }

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

  async updateQuantidade(itemId: number, quantidade: number, userId?: number, userEmail?: string) {
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

    const anterior = item.quantidadePlanejada;
    item.quantidadePlanejada = quantidade;
    const saved = await this.repository.save(item);

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'UPDATE',
      'checklist_item',
      item.id,
      { quantidadeAnterior: anterior, quantidadeNova: quantidade },
      `Quantidade atualizada: ${anterior} -> ${quantidade}`,
    );

    return saved;
  }

  async remove(itemId: number, userId?: number, userEmail?: string) {
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

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'DELETE',
      'checklist_item',
      itemId,
      { equipmentNome: item.nomeSnapshot, checklistId: item.checklistId },
      `Item "${item.nomeSnapshot}" removido do checklist`,
    );

    return { message: 'Item removido com sucesso' };
  }

  async trocarEquipamento(
    itemId: number,
    equipmentId: number,
    quantidade: number,
    userId?: number,
    userEmail?: string,
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

    const nomeAnterior = item.nomeSnapshot;
    item.equipmentId = equipment.id;
    item.nomeSnapshot = equipment.nome;
    item.descricaoSnapshot = equipment.descricao;
    item.quantidadePlanejada = quantidade;

    const saved = await this.repository.save(item);

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'UPDATE',
      'checklist_item',
      item.id,
      { anterior: nomeAnterior, novo: equipment.nome, quantidade },
      `Equipamento trocado: "${nomeAnterior}" -> "${equipment.nome}"`,
    );

    return saved;
  }

  async cancelarSeparacao(itemId: number, quantidade: number, userId?: number, userEmail?: string) {
    return this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(ChecklistItem, {
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

      const equipment = await manager.findOne(Equipment, {
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

      // Return stock
      if (equipment.origem === 'interno') {
        equipment.quantidadeDisponivel += quantidade;
        await manager.save(Equipment, equipment);
      }

      item.quantidadeSeparada -= quantidade;

      item.statusSeparacao =
        item.quantidadeSeparada === item.quantidadePlanejada
          ? 'separado'
          : 'pendente';

      await manager.save(ChecklistItem, item);

      await this.historyService.registrarSeparacao(
        item.id,
        anterior,
        item.quantidadeSeparada,
        userEmail ?? 'sistema',
      );

      await this.atualizarStatusChecklistTx(manager, item.checklistId);

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'CANCELAR_SEPARACAO',
        'checklist_item',
        item.id,
        { quantidadeAnterior: anterior, quantidadeNova: item.quantidadeSeparada },
        `Separação cancelada: ${quantidade}x "${item.nomeSnapshot}"`,
      );

      return {
        mensagem: 'Separação cancelada com sucesso',
        item,
      };
    });
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
