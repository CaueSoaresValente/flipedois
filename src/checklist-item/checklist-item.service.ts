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
import { StockService } from '../stock/stock.service';

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
    private readonly stockService: StockService,
  ) {}

  // ==============================
  // CRIAR ITEM
  // ==============================
  /**
   * Cria um item no checklist.
   * - Em rascunho: apenas cria o registro.
   * - Em liberado: cria o registro E reserva o estoque imediatamente.
   */
  async create(data: CreateChecklistItemDto, userId?: number, userEmail?: string) {
    return this.dataSource.transaction(async (manager) => {
      const checklist = await manager.findOne(Checklist, {
        where: { id: data.checklistId },
      });

      if (!checklist) {
        throw new BadRequestException('Checklist não encontrado.');
      }

      const editableStatuses = ['rascunho', 'liberado'];
      if (!editableStatuses.includes(checklist.status)) {
        throw new BadRequestException(
          `Não é possível adicionar itens a um checklist com status "${checklist.status}".`,
        );
      }

      const equipment = await manager.findOne(Equipment, {
        where: { id: data.equipmentId },
      });

      if (!equipment) {
        throw new BadRequestException('Equipamento não encontrado.');
      }

      if (!equipment.ativo) {
        throw new BadRequestException('Equipamento está inativo.');
      }

      if (data.quantidadePlanejada <= 0) {
        throw new BadRequestException('Quantidade inválida. Deve ser maior que zero.');
      }

      // Para rascunho: avisa se estoque insuficiente mas não bloqueia
      // Para liberado: verifica e reserva
      if (checklist.status === 'liberado') {
        if (
          equipment.origem === 'interno' &&
          data.quantidadePlanejada > equipment.quantidadeDisponivel
        ) {
          throw new BadRequestException(
            `Estoque insuficiente para "${equipment.nome}". Disponível: ${equipment.quantidadeDisponivel}, Solicitado: ${data.quantidadePlanejada}.`,
          );
        }
      }

      const existing = await manager.findOne(ChecklistItem, {
        where: {
          checklistId: data.checklistId,
          equipmentId: data.equipmentId,
        },
      });

      if (existing) {
        throw new BadRequestException('Este equipamento já foi adicionado ao checklist.');
      }

      const item = manager.create(ChecklistItem, {
        checklistId: data.checklistId,
        equipmentId: equipment.id,
        nomeSnapshot: equipment.nome,
        descricaoSnapshot: equipment.descricao,
        quantidadePlanejada: data.quantidadePlanejada,
        setor: data.setor,
      });

      const saved = await manager.save(ChecklistItem, item);

      // Se liberado: reserva estoque imediatamente
      if (checklist.status === 'liberado') {
        await this.stockService.reservarEstoque(manager, equipment.id, data.quantidadePlanejada);
      }

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'CREATE',
        'checklist_item',
        saved.id,
        {
          checklistId: data.checklistId,
          equipmentId: data.equipmentId,
          quantidade: data.quantidadePlanejada,
          checklistStatus: checklist.status,
        },
        `Item "${equipment.nome}" adicionado ao checklist (status: ${checklist.status})`,
      );

      return saved;
    });
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
  // SEPARAÇÃO — Apenas tracking, estoque já foi reservado na liberação
  // ==============================
  async separarItem(itemId: number, quantidade: number, userId?: number, userEmail?: string) {
    console.log(`[SEPARAR] itemId=${itemId}, quantidade=${quantidade}`);

    return this.dataSource.transaction(async (manager) => {
      try {
        const item = await manager.findOne(ChecklistItem, {
          where: { id: itemId },
          relations: ['checklist'],
        });

        if (!item) throw new BadRequestException('Item não encontrado.');

        if (item.checklist.status === 'cancelado') {
          throw new BadRequestException('Checklist cancelado.');
        }

        if (item.checklist.status !== 'liberado') {
          throw new BadRequestException(
            `Checklist não está liberado para separação. Status atual: "${item.checklist.status}".`,
          );
        }

        if (quantidade <= 0) {
          throw new BadRequestException('Quantidade inválida. Deve ser maior que zero.');
        }

        if (item.quantidadeSeparada + quantidade > item.quantidadePlanejada) {
          const max = item.quantidadePlanejada - item.quantidadeSeparada;
          throw new BadRequestException(
            `Excede quantidade planejada. Máximo restante: ${max}.`,
          );
        }

        // NOTA: O estoque já foi reservado (disponivel → emUso) na liberação do checklist.
        // A separação apenas registra quantas unidades físicas foram efetivamente separadas.
        // Não há movimentação de estoque aqui.

        const anterior = item.quantidadeSeparada;
        item.quantidadeSeparada += quantidade;
        item.statusSeparacao =
          item.quantidadeSeparada === item.quantidadePlanejada ? 'separado' : 'pendente';

        await manager.save(ChecklistItem, item);

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
            equipmentNome: item.nomeSnapshot,
            quantidadeAnterior: anterior,
            quantidadeNova: item.quantidadeSeparada,
            quantidadePlanejada: item.quantidadePlanejada,
          },
          `Separado ${quantidade}x "${item.nomeSnapshot}"`,
        );

        let aviso = '';
        if (item.quantidadeSeparada < item.quantidadePlanejada) {
          aviso = `Separação parcial: ${item.quantidadeSeparada}/${item.quantidadePlanejada}`;
        } else {
          aviso = 'Item totalmente separado';
        }

        const checklistAtualizado = await manager.findOne(Checklist, {
          where: { id: item.checklistId },
        });

        const alerta = await this.verificarConflitoEventosTx(
          manager,
          item.equipmentId,
          item.checklistId,
        );

        return { aviso, alerta, item, checklist: checklistAtualizado };
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        console.error('[SEPARAR] Erro inesperado:', error);
        throw new BadRequestException('Erro interno ao processar a separação. Tente novamente.');
      }
    });
  }

  // ==============================
  // DEVOLUÇÃO — Ajuste imediato de estoque via StockService
  // ==============================
  /**
   * Registra a devolução de um item do checklist.
   *
   * CORREÇÕES IMPLEMENTADAS:
   *
   * OK:       disponivel += qty (interno), emUso -= qty (todos)
   * Quebrado: emUso -= qty, danificada += qty, total -= qty  ← IMEDIATO, sem esperar ocorrência
   * Perdido:  emUso -= qty, perdida += qty, total -= qty     ← IMEDIATO
   *
   * Ocorrência é criada como registro de auditoria (PENDENTE) sem impacto no estoque.
   * A ocorrência pode ser "Confirmada como Baixa" (apenas muda status) ou cancelada
   * (revertendo o damage: danificada → disponivel, total++).
   */
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
          relations: ['checklist'],
        });

        if (!item) throw new BadRequestException('Item não encontrado.');

        if (quantidade <= 0) throw new BadRequestException('Quantidade inválida.');

        const maxDevolvivel = item.quantidadeSeparada - item.quantidadeDevolvida;
        if (quantidade > maxDevolvivel) {
          throw new BadRequestException(
            `Quantidade excede o máximo devolvível. Máximo: ${maxDevolvivel}.`,
          );
        }

        const anterior = item.quantidadeDevolvida;

        // ============================================================
        // AJUSTE DE ESTOQUE — Imediato para todos os casos
        // ============================================================
        if (situacao === 'ok') {
          item.quantidadeOk = (item.quantidadeOk || 0) + quantidade;
          // OK: devolve ao disponível, sai do emUso
          await this.stockService.registrarDevolucaoOk(manager, item.equipmentId, quantidade);

        } else if (situacao === 'quebrado') {
          item.quantidadeQuebrada = (item.quantidadeQuebrada || 0) + quantidade;
          // ✅ CORRIGIDO: Ajuste imediato — não permanece em emUso
          // emUso -= qty, danificada += qty, total -= qty
          await this.stockService.registrarDevolucaoDanificado(manager, item.equipmentId, quantidade);

        } else if (situacao === 'perdido') {
          item.quantidadePerdida = (item.quantidadePerdida || 0) + quantidade;
          // ✅ CORRIGIDO: Ajuste imediato — não permanece em emUso
          // emUso -= qty, perdida += qty, total -= qty
          await this.stockService.registrarDevolucaoPerdido(manager, item.equipmentId, quantidade);
        }

        item.quantidadeDevolvida += quantidade;

        // ============================================================
        // OCORRÊNCIA — Apenas rastreamento/auditoria (sem impacto no estoque)
        // ============================================================
        if (situacao !== 'ok') {
          const tipoOcorrencia = situacao === 'quebrado' ? 'DANO' : 'PERDA';
          const checklist = await manager.findOne(Checklist, {
            where: { id: item.checklistId },
            relations: ['event'],
          });

          const occurrence = manager.create(EquipmentOccurrence, {
            equipment: { id: item.equipmentId } as Equipment,
            quantidade,
            descricao: `Devolução: "${item.nomeSnapshot}" registrado como ${situacao === 'quebrado' ? 'quebrado' : 'perdido'}`,
            tipo: tipoOcorrencia,
            // ✅ Status PENDENTE = auditoria pendente de revisão (estoque já foi ajustado)
            status: 'PENDENTE',
            motivo: `Gerado automaticamente via devolução do checklist #${item.checklistId}`,
            ...(checklist?.event ? { event: checklist.event } : {}),
          });
          await manager.save(EquipmentOccurrence, occurrence);
        }

        // Define status de devolução
        if (item.quantidadeDevolvida === item.quantidadeSeparada) {
          if (item.quantidadePerdida > 0) item.statusDevolucao = 'perdido';
          else if (item.quantidadeQuebrada > 0) item.statusDevolucao = 'quebrado';
          else item.statusDevolucao = 'devolvido';
        } else {
          item.statusDevolucao = 'faltando';
        }

        await manager.save(ChecklistItem, item);

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

        const mensagens = {
          ok: 'Equipamento devolvido ao estoque.',
          quebrado: 'Equipamento registrado como danificado. Estoque ajustado. Ocorrência criada para auditoria.',
          perdido: 'Equipamento registrado como perdido. Estoque ajustado. Ocorrência criada para auditoria.',
        };

        return { mensagem: mensagens[situacao], item };
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        console.error('[DEVOLVER] Erro inesperado:', error);
        throw new BadRequestException('Erro interno ao processar a devolução. Tente novamente.');
      }
    });
  }

  // ==============================
  // STATUS AUTOMÁTICO DO CHECKLIST (transaction-aware)
  // ==============================
  private async atualizarStatusChecklistTx(manager: EntityManager, checklistId: number) {
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

  // ==============================
  // ATUALIZAR QUANTIDADE — rascunho ou liberado/em_evento/pendente_devolucao
  // ==============================
  /**
   * Atualiza a quantidade planejada de um item.
   *
   * Rascunho: Apenas valida disponibilidade (sem ajuste de estoque).
   * Liberado/em_evento/pendente_devolucao: Calcula delta e ajusta estoque.
   *   delta > 0: reservarEstoque (valida disponível)
   *   delta < 0: liberarReserva
   *
   * Validação adicional: nova quantidade não pode ser menor que já separado.
   */
  async updateQuantidade(itemId: number, quantidade: number, userId?: number, userEmail?: string) {
    if (quantidade <= 0) {
      throw new BadRequestException('Quantidade inválida. Deve ser maior que zero.');
    }

    return this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(ChecklistItem, {
        where: { id: itemId },
        relations: ['checklist'],
      });

      if (!item) throw new BadRequestException('Item não encontrado.');

      const status = item.checklist.status;

      if (!['rascunho', 'liberado', 'em_evento', 'pendente_devolucao'].includes(status)) {
        throw new BadRequestException(
          `Não é possível alterar quantidade de item em checklist com status "${status}".`,
        );
      }

      // Não pode reduzir abaixo do que já foi separado
      if (quantidade < item.quantidadeSeparada) {
        throw new BadRequestException(
          `Quantidade não pode ser menor que o já separado (${item.quantidadeSeparada}).`,
        );
      }

      const equipment = await this.equipmentRepository.findOne({
        where: { id: item.equipmentId },
      });

      if (!equipment || !equipment.ativo) {
        throw new BadRequestException('Equipamento inválido ou inativo.');
      }

      const anterior = item.quantidadePlanejada;
      const delta = quantidade - anterior;

      if (status !== 'rascunho') {
        // Checklist com estoque reservado: ajustar conforme delta
        if (delta > 0) {
          await this.stockService.reservarEstoque(manager, item.equipmentId, delta);
        } else if (delta < 0) {
          await this.stockService.liberarReserva(manager, item.equipmentId, Math.abs(delta));
        }
      } else {
        // Rascunho: apenas valida disponibilidade
        if (
          equipment.origem === 'interno' &&
          quantidade > equipment.quantidadeDisponivel
        ) {
          throw new BadRequestException(
            `Estoque insuficiente para "${equipment.nome}". Disponível: ${equipment.quantidadeDisponivel}.`,
          );
        }
      }

      item.quantidadePlanejada = quantidade;
      await manager.save(ChecklistItem, item);

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'UPDATE',
        'checklist_item',
        item.id,
        { quantidadeAnterior: anterior, quantidadeNova: quantidade, delta },
        `Quantidade atualizada: ${anterior} → ${quantidade}`,
      );

      return item;
    });
  }

  async remove(itemId: number, userId?: number, userEmail?: string) {
    return this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(ChecklistItem, {
        where: { id: itemId },
        relations: ['checklist'],
      });

      if (!item) throw new BadRequestException('Item não encontrado.');

      const status = item.checklist.status;

      if (!['rascunho', 'liberado'].includes(status)) {
        throw new BadRequestException(
          `Só é possível remover itens de checklist em rascunho ou liberado. Status atual: "${status}".`,
        );
      }

      // Se liberado: reverter reserva de estoque antes de remover
      if (status === 'liberado') {
        const quantidadeReservada = item.quantidadePlanejada - item.quantidadeSeparada;
        if (quantidadeReservada > 0) {
          await this.stockService.liberarReserva(manager, item.equipmentId, quantidadeReservada);
        }
      }

      await manager.delete(ChecklistItem, itemId);

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'DELETE',
        'checklist_item',
        itemId,
        { equipmentNome: item.nomeSnapshot, checklistId: item.checklistId },
        `Item "${item.nomeSnapshot}" removido do checklist`,
      );

      return { message: 'Item removido com sucesso.' };
    });
  }

  async trocarEquipamento(
    itemId: number,
    equipmentId: number,
    quantidade: number,
    userId?: number,
    userEmail?: string,
  ) {
    if (quantidade <= 0) throw new BadRequestException('Quantidade inválida.');

    const item = await this.repository.findOne({
      where: { id: itemId },
      relations: ['checklist'],
    });

    if (!item) throw new BadRequestException('Item não encontrado.');

    if (item.checklist.status !== 'rascunho') {
      throw new BadRequestException(
        'Troca de equipamento só é permitida em checklist rascunho.',
      );
    }

    const equipment = await this.equipmentRepository.findOne({
      where: { id: equipmentId },
    });

    if (!equipment || !equipment.ativo) {
      throw new BadRequestException('Equipamento inválido ou inativo.');
    }

    if (
      equipment.origem === 'interno' &&
      quantidade > equipment.quantidadeDisponivel
    ) {
      throw new BadRequestException(
        `Estoque insuficiente para "${equipment.nome}". Disponível: ${equipment.quantidadeDisponivel}.`,
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
      `Equipamento trocado: "${nomeAnterior}" → "${equipment.nome}"`,
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
        if (quantidade <= 0) throw new BadRequestException('Quantidade inválida.');

        const disponivelParaCancelar =
          item.quantidadeSeparada - item.quantidadeDevolvida;

        if (quantidade > disponivelParaCancelar) {
          throw new BadRequestException(
            `Só é possível cancelar ${disponivelParaCancelar} unidade(s) (${item.quantidadeSeparada} separadas - ${item.quantidadeDevolvida} devolvidas).`,
          );
        }

        if (item.checklist.status === 'em_evento') {
          throw new BadRequestException(
            'Não é possível cancelar separação durante o evento.',
          );
        }

        const anterior = item.quantidadeSeparada;

        // NOTA: A separação não moveu estoque (apenas tracking).
        // O estoque permanece em emUso até: devolução, ou cancelamento do checklist.
        item.quantidadeSeparada -= quantidade;
        item.statusSeparacao =
          item.quantidadeSeparada === item.quantidadePlanejada ? 'separado' : 'pendente';

        await manager.save(ChecklistItem, item);

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

        return { mensagem: 'Separação cancelada com sucesso.', item };
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        console.error('[CANCELAR_SEPARACAO] Erro inesperado:', error);
        throw new BadRequestException('Erro interno ao cancelar a separação. Tente novamente.');
      }
    });
  }

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
      console.warn('[SEPARAR] Falha ao verificar conflito de eventos:', error);
      return null;
    }
  }
}
