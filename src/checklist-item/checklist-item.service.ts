import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ChecklistItem } from './checklist-item.entity';
import { Checklist } from '../checklist/checklist.entity';
import { Equipment } from '../equipment/equipment.entity';
import { ChecklistItemHistoryService } from '../checklist-item-history/checklist-item-history.service';
import { ChecklistItemHistory } from '../checklist-item-history/checklist-item-history.entity';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { Event } from '../event/event.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EquipmentOccurrence } from '../equipment-occurrence/equipment-occurrence.entity';

@Injectable()
export class ChecklistItemService {
  constructor(
    @InjectRepository(ChecklistItem)
    private readonly repository: Repository<ChecklistItem>,

    @InjectRepository(Equipment)
    private readonly equipmentRepository: Repository<Equipment>,

    @InjectRepository(Checklist)
    private readonly checklistRepository: Repository<Checklist>,

    @InjectRepository(EquipmentOccurrence)
    private readonly occurrenceRepository: Repository<EquipmentOccurrence>,

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
    console.log(`[SEPARAR] Início: itemId=${itemId}, quantidade=${quantidade}, userId=${userId}, userEmail=${userEmail}`);

    return this.dataSource.transaction(async (manager) => {
      try {
        const item = await manager.findOne(ChecklistItem, {
          where: { id: itemId },
          relations: ['checklist'],
        });

        if (!item) {
          console.log('[SEPARAR] FALHA: Item não encontrado');
          throw new BadRequestException('Item não encontrado.');
        }

        console.log(`[SEPARAR] Item: equipamento="${item.nomeSnapshot}", checklistStatus="${item.checklist.status}", planejada=${item.quantidadePlanejada}, separada=${item.quantidadeSeparada}`);

        if (item.checklist.status === 'cancelado') {
          console.log('[SEPARAR] FALHA: Checklist cancelado');
          throw new BadRequestException('Checklist cancelado.');
        }

        if (item.checklist.status !== 'liberado') {
          console.log(`[SEPARAR] FALHA: Checklist não liberado (status="${item.checklist.status}")`);
          throw new BadRequestException(`Checklist não está liberado para separação (status atual: ${item.checklist.status}).`);
        }

        if (quantidade <= 0) {
          console.log('[SEPARAR] FALHA: Quantidade inválida');
          throw new BadRequestException('Quantidade inválida.');
        }

        if (item.quantidadeSeparada + quantidade > item.quantidadePlanejada) {
          const max = item.quantidadePlanejada - item.quantidadeSeparada;
          console.log(`[SEPARAR] FALHA: Excede planejada. Max restante=${max}`);
          throw new BadRequestException(
            `Excede quantidade planejada. Máximo restante: ${max}.`,
          );
        }

        const equipment = await manager.findOne(Equipment, {
          where: { id: item.equipmentId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!equipment) {
          console.log('[SEPARAR] FALHA: Equipamento não encontrado');
          throw new BadRequestException('Equipamento não encontrado.');
        }

        console.log(`[SEPARAR] Equipamento: nome="${equipment.nome}", origem="${equipment.origem}", disponivel=${equipment.quantidadeDisponivel}, total=${equipment.quantidadeTotal}`);

        // Block if no stock available
        if (
          equipment.origem === 'interno' &&
          quantidade > equipment.quantidadeDisponivel
        ) {
          console.log(`[SEPARAR] FALHA: Estoque insuficiente. Solicitado=${quantidade}, Disponível=${equipment.quantidadeDisponivel}`);
          throw new BadRequestException(
            `Estoque insuficiente. Solicitado: ${quantidade}, Disponível: ${equipment.quantidadeDisponivel}.`,
          );
        }

        const anterior = item.quantidadeSeparada;

        // Deduct stock within transaction — PESSIMISTIC LOCK prevents race conditions
        if (equipment.origem === 'interno') {
          equipment.quantidadeDisponivel -= quantidade;
          if (equipment.quantidadeDisponivel < 0) {
            throw new BadRequestException('Estoque não pode ficar negativo.');
          }
          await manager.save(Equipment, equipment);
        }

        item.quantidadeSeparada += quantidade;

        item.statusSeparacao =
          item.quantidadeSeparada === item.quantidadePlanejada
            ? 'separado'
            : 'pendente';

        await manager.save(ChecklistItem, item);

        // Save history INSIDE the transaction via manager
        await manager.save(ChecklistItemHistory, {
          checklistItemId: item.id,
          acao: 'SEPARACAO',
          quantidadeAnterior: anterior,
          quantidadeNova: item.quantidadeSeparada,
          usuario: userEmail ?? 'sistema',
        });

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

        // Use transaction manager for conflict check
        const alerta = await this.verificarConflitoEventosTx(
          manager,
          item.equipmentId,
          item.checklistId,
        );

        return {
          aviso,
          alerta,
          item,
          checklist: checklistAtualizado,
        };
      } catch (error) {
        // Re-throw known NestJS exceptions as-is
        if (error instanceof BadRequestException) {
          throw error;
        }
        // Wrap unexpected errors in a Portuguese message
        console.error('[SEPARAR] Erro inesperado:', error);
        throw new BadRequestException('Erro interno ao processar a separação. Tente novamente.');
      }
    });
  }

  // ==============================
  // DEVOLUÇÃO (FUNCIONÁRIO) — with transaction, per-condition tracking + auto-occurrence
  // ==============================
  async devolverItem(
    itemId: number,
    quantidade: number,
    situacao: 'ok' | 'quebrado' | 'perdido',
    userId?: number,
    userEmail?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      try {
        const item = await manager.findOne(ChecklistItem, {
          where: { id: itemId },
        });

        if (!item) throw new BadRequestException('Item não encontrado.');

        if (quantidade <= 0) throw new BadRequestException('Quantidade inválida.');

        if (item.quantidadeDevolvida + quantidade > item.quantidadeSeparada) {
          throw new BadRequestException(
            `Quantidade excede separação. Máximo: ${item.quantidadeSeparada - item.quantidadeDevolvida}.`,
          );
        }

        // Pessimistic lock to prevent concurrent return of same item
        const equipment = await manager.findOne(Equipment, {
          where: { id: item.equipmentId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!equipment) throw new BadRequestException('Equipamento não encontrado.');

        const anterior = item.quantidadeDevolvida;

        // Track per-condition quantities
        if (situacao === 'ok') {
          item.quantidadeOk = (item.quantidadeOk || 0) + quantidade;
        } else if (situacao === 'quebrado') {
          item.quantidadeQuebrada = (item.quantidadeQuebrada || 0) + quantidade;
        } else if (situacao === 'perdido') {
          item.quantidadePerdida = (item.quantidadePerdida || 0) + quantidade;
        }

        item.quantidadeDevolvida += quantidade;

        // Only return stock for items in OK condition
        if (situacao === 'ok' && equipment.origem === 'interno') {
          equipment.quantidadeDisponivel += quantidade;
          await manager.save(Equipment, equipment);
        }

        // Auto-create occurrence for damaged/lost items
        if (situacao !== 'ok') {
          const tipoOcorrencia = situacao === 'quebrado' ? 'DANO' : 'PERDA';
          // Find event linked to this checklist
          const checklist = await manager.findOne(Checklist, {
            where: { id: item.checklistId },
            relations: ['event'],
          });
          const occurrence = manager.create(EquipmentOccurrence, {
            equipment,
            quantidade,
            descricao: `Devolução: ${item.nomeSnapshot} registrado como ${situacao === 'quebrado' ? 'quebrado' : 'perdido'}`,
            tipo: tipoOcorrencia,
            status: 'PENDENTE',
            motivo: `Auto-gerado via devolução do checklist #${item.checklistId}`,
            ...(checklist?.event ? { event: checklist.event } : {}),
          });
          await manager.save(EquipmentOccurrence, occurrence);
        }

        // Set final return status
        if (item.quantidadeDevolvida === item.quantidadeSeparada) {
          if (item.quantidadePerdida > 0) item.statusDevolucao = 'perdido';
          else if (item.quantidadeQuebrada > 0) item.statusDevolucao = 'quebrado';
          else item.statusDevolucao = 'devolvido';
        } else {
          item.statusDevolucao = 'faltando';
        }

        await manager.save(ChecklistItem, item);

        // Save history INSIDE the transaction via manager
        await manager.save(ChecklistItemHistory, {
          checklistItemId: item.id,
          acao: 'DEVOLUCAO',
          quantidadeAnterior: anterior,
          quantidadeNova: item.quantidadeDevolvida,
          usuario: userEmail ?? 'sistema',
        });

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
            quantidadeOk: item.quantidadeOk,
            quantidadeQuebrada: item.quantidadeQuebrada,
            quantidadePerdida: item.quantidadePerdida,
          },
          `Devolvido ${quantidade}x "${item.nomeSnapshot}" (${situacao})`,
        );

        return {
          mensagem:
            situacao === 'ok'
              ? 'Item devolvido ao estoque'
              : situacao === 'quebrado'
                ? 'Item registrado como quebrado (ocorrência criada)'
                : 'Item registrado como perdido (ocorrência criada)',
          item,
        };
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        console.error('[DEVOLVER] Erro inesperado:', error);
        throw new BadRequestException('Erro interno ao processar a devolução. Tente novamente.');
      }
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
      try {
        const item = await manager.findOne(ChecklistItem, {
          where: { id: itemId },
          relations: ['checklist'],
        });

        if (!item) throw new BadRequestException('Item não encontrado.');

        if (quantidade <= 0) {
          throw new BadRequestException('Quantidade inválida.');
        }

        const disponivelParaCancelar =
          item.quantidadeSeparada - item.quantidadeDevolvida;

        if (quantidade > disponivelParaCancelar) {
          throw new BadRequestException(
            `Só é possível cancelar ${disponivelParaCancelar} unidade(s).`,
          );
        }

        const equipment = await manager.findOne(Equipment, {
          where: { id: item.equipmentId },
        });

        if (!equipment) {
          throw new BadRequestException('Equipamento não encontrado.');
        }

        if (item.checklist.status === 'em_evento') {
          throw new BadRequestException(
            'Não é possível cancelar separação durante o evento.',
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

        // Save history INSIDE the transaction via manager
        await manager.save(ChecklistItemHistory, {
          checklistItemId: item.id,
          acao: 'SEPARACAO',
          quantidadeAnterior: anterior,
          quantidadeNova: item.quantidadeSeparada,
          usuario: userEmail ?? 'sistema',
        });

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
          mensagem: 'Separação cancelada com sucesso.',
          item,
        };
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        console.error('[CANCELAR_SEPARACAO] Erro inesperado:', error);
        throw new BadRequestException('Erro interno ao cancelar a separação. Tente novamente.');
      }
    });
  }

  /**
   * Transaction-safe version: uses the transaction manager to avoid
   * opening a separate DB connection that could conflict with locks.
   */
  private async verificarConflitoEventosTx(
    manager: EntityManager,
    equipmentId: number,
    checklistId: number,
  ) {
    try {
      const eventoAtual = await manager.findOne(Event, {
        where: { checklist: { id: checklistId } },
      });

      if (!eventoAtual) return null;

      const outrosEventos = await manager
        .createQueryBuilder(Event, 'event')
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
    } catch (error) {
      // Non-critical: if conflict check fails, log and continue
      console.warn('[SEPARAR] Aviso: falha ao verificar conflito de eventos:', error);
      return null;
    }
  }
}
