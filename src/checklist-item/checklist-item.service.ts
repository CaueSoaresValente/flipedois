import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ChecklistItem } from './checklist-item.entity';
import { Checklist, ChecklistStatus } from '../checklist/checklist.entity';
import { Equipment } from '../equipment/equipment.entity';
import { ChecklistItemHistoryService } from '../checklist-item-history/checklist-item-history.service';
import { ChecklistItemHistory } from '../checklist-item-history/checklist-item-history.entity';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { Event } from '../event/event.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EquipmentOccurrence } from '../equipment-occurrence/equipment-occurrence.entity';
import { EquipmentOccurrenceService } from '../equipment-occurrence/equipment-occurrence.service';
import { StockService } from '../stock/stock.service';
import { NotificationService } from '../notification/notification.service';

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
    private readonly occurrenceService: EquipmentOccurrenceService,
    private readonly notificationService: NotificationService,
  ) {}

  // ==============================
  // CRIAR ITEM
  // ==============================
  /**
   * Cria um item no checklist.
   * - Em rascunho: apenas cria o registro.
   * - Em liberado: cria o registro E reserva o estoque imediatamente.
   */
  async create(
    data: CreateChecklistItemDto,
    userId?: number,
    userEmail?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const checklist = await manager.findOne(Checklist, {
        where: { id: data.checklistId },
      });

      if (!checklist) {
        throw new BadRequestException('Checklist não encontrado.');
      }

      const editableStatuses = ['rascunho', 'liberado', 'em_evento', 'pendente_devolucao'];
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
        throw new BadRequestException(
          'Quantidade inválida. Deve ser maior que zero.',
        );
      }

      // Validar estoque disponível em QUALQUER status
      if (data.quantidadePlanejada > equipment.quantidadeDisponivel) {
        throw new BadRequestException(
          `Estoque insuficiente para "${equipment.nome}". Disponível: ${equipment.quantidadeDisponivel}, Solicitado: ${data.quantidadePlanejada}.`,
        );
      }

      const existing = await manager.findOne(ChecklistItem, {
        where: {
          checklistId: data.checklistId,
          equipmentId: data.equipmentId,
        },
      });

      if (existing) {
        throw new BadRequestException(
          'Este equipamento já foi adicionado ao checklist.',
        );
      }

      const item = manager.create(ChecklistItem, {
        checklistId: data.checklistId,
        equipmentId: equipment.id,
        nomeSnapshot: equipment.nome,
        descricaoSnapshot: equipment.descricao,
        quantidadePlanejada: data.quantidadePlanejada,
        setor: (equipment as any).setor || 'som',
      });

      const saved = await manager.save(ChecklistItem, item);

      // Se ativo: reserva estoque imediatamente
      if (checklist.status !== 'rascunho') {
        await this.stockService.reservarEstoque(
          manager,
          equipment.id,
          data.quantidadePlanejada,
        );
      }

      // Notificar funcionários se checklist estiver em status ativo
      if (checklist.status !== 'rascunho') {
        await this.notificationService.notificarFuncionarios(
          'EQUIPAMENTO_ADICIONADO',
          data.checklistId,
          checklist.nome,
          equipment.nome,
          undefined,
          data.quantidadePlanejada,
        );
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

      // Recalcular status do checklist (pode voltar de em_evento → liberado)
      await this.atualizarStatusChecklistTx(manager, data.checklistId);

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
  async separarItem(
    itemId: number,
    quantidade: number,
    userId?: number,
    userEmail?: string,
  ) {
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

        // Permitir separação se estiver liberado OU se estiver em evento/pendente_devolucao
        // O status liberado é o padrão, mas em_evento/pendente_devolucao também devem permitir
        // se houver itens que voltaram a ficar pendentes (ex: aumento de quantidade pelo admin)
        const statusPermitidosParaSeparacao: ChecklistStatus[] = [
          'liberado',
          'em_evento',
          'pendente_devolucao',
        ];
        if (!statusPermitidosParaSeparacao.includes(item.checklist.status)) {
          throw new BadRequestException(
            `Checklist não está em uma fase ativa para separação. Status atual: "${item.checklist.status}".`,
          );
        }

        if (quantidade <= 0) {
          throw new BadRequestException(
            'Quantidade inválida. Deve ser maior que zero.',
          );
        }

        if (item.quantidadeSeparada + quantidade > item.quantidadePlanejada) {
          const max = item.quantidadePlanejada - item.quantidadeSeparada;
          throw new BadRequestException(
            `Excede quantidade planejada. Máximo restante: ${max}.`,
          );
        }

        const anterior = item.quantidadeSeparada;
        item.quantidadeSeparada += quantidade;
        item.statusSeparacao =
          item.quantidadeSeparada === item.quantidadePlanejada
            ? 'separado'
            : 'pendente';

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

        return { aviso, alerta: null, item, checklist: checklistAtualizado };
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        console.error('[SEPARAR] Erro inesperado:', error);
        throw new BadRequestException(
          'Erro interno ao processar a separação. Tente novamente.',
        );
      }
    });
  }

  // ==============================
  // DEVOLUÇÃO — MIXED RETURN (OK + Danificado + Perdido)
  // ==============================
  /**
   * Registra a devolução de um item do checklist.
   *
   * NOVO MODELO — MIXED RETURN (OBRIGATÓRIO):
   *
   * O funcionário informa PARA CADA ITEM:
   *   - quantidadeOk: itens em bom estado
   *   - quantidadeDanificada: itens com defeito
   *   - quantidadePerdida: itens extraviados
   *
   * REGRA DE VALIDAÇÃO:
   *   quantidadeOk + quantidadeDanificada + quantidadePerdida <= maxDevolvivel
   *   quantidadeOk + quantidadeDanificada + quantidadePerdida > 0
   *
   * COMPORTAMENTO:
   *   ✅ OK > 0: disponivel += OK, emUso -= OK (automático, sem aprovação)
   *   ⚠️ DANIFICADO > 0: cria ocorrência PENDENTE, NÃO muda estoque
   *   ⚠️ PERDIDO > 0: cria ocorrência PENDENTE, NÃO muda estoque
   *
   * Estoque para DANO/PERDA SÓ muda quando Felipe confirma a ocorrência.
   */
  async devolverItem(
    itemId: number,
    quantidadeOk: number,
    quantidadeDanificada: number,
    quantidadePerdida: number,
    observacao?: string,
    userId?: number,
    userEmail?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      try {
        const item = await manager.findOne(ChecklistItem, {
          where: { id: itemId },
          relations: ['checklist', 'checklist.event'],
        });

        if (!item) throw new BadRequestException('Item não encontrado.');

        const totalReturn = quantidadeOk + quantidadeDanificada + quantidadePerdida;

        if (totalReturn <= 0) {
          throw new BadRequestException(
            'Informe pelo menos uma quantidade para devolver.',
          );
        }

        const maxDevolvivel =
          item.quantidadeSeparada - item.quantidadeDevolvida;
        if (totalReturn > maxDevolvivel) {
          throw new BadRequestException(
            `Quantidade total (${totalReturn}) excede o máximo devolvível (${maxDevolvivel}).`,
          );
        }

        const anterior = item.quantidadeDevolvida;
        item.quantidadeDevolvida += totalReturn;
        item.quantidadeDevolvidaOriginal = (item.quantidadeDevolvidaOriginal || 0) + totalReturn;

        if (observacao) {
          item.observacaoDevolucao = observacao;
        }

        // ============================================================
        // 1. OK — Automático: atualiza estoque imediatamente
        // ============================================================
        if (quantidadeOk > 0) {
          await this.stockService.registrarDevolucaoOk(
            manager,
            item.equipmentId,
            quantidadeOk,
          );
        }

        // ============================================================
        // 2. DANIFICADO — Cria ocorrência PENDENTE, NÃO muda estoque
        // ============================================================
        if (quantidadeDanificada > 0) {
          await this.occurrenceService.registrarTx(
            manager,
            item.checklist?.event?.id ?? null,
            item.equipmentId,
            quantidadeDanificada,
            `Devolução: "${item.nomeSnapshot}" classificado como danificado`,
            'DANO',
            `Devolução do checklist #${item.checklistId}`,
            item.id,
          );
        }

        // ============================================================
        // 3. PERDIDO — Cria ocorrência PENDENTE, NÃO muda estoque
        // ============================================================
        if (quantidadePerdida > 0) {
          await this.occurrenceService.registrarTx(
            manager,
            item.checklist?.event?.id ?? null,
            item.equipmentId,
            quantidadePerdida,
            `Devolução: "${item.nomeSnapshot}" classificado como perdido`,
            'PERDA',
            `Devolução do checklist #${item.checklistId}`,
            item.id,
          );
        }

        // Sync checklist fields from occurrences
        // First save the base item with updated quantidadeDevolvida
        await manager.save(ChecklistItem, item);

        // Now sync OK/Qb/Pd from occurrences
        await this.occurrenceService.syncChecklistItemFromOccurrences(
          manager,
          item.id,
        );

        // Re-read item after sync
        const updatedItem = await manager.findOne(ChecklistItem, {
          where: { id: itemId },
        });

        await manager.save(ChecklistItemHistory, {
          checklistItemId: item.id,
          acao: 'DEVOLUCAO',
          quantidadeAnterior: anterior,
          quantidadeNova: item.quantidadeDevolvida,
          usuario: userEmail ?? 'sistema',
        });

        const parts: string[] = [];
        if (quantidadeOk > 0) parts.push(`${quantidadeOk}x OK`);
        if (quantidadeDanificada > 0) parts.push(`${quantidadeDanificada}x Danificado`);
        if (quantidadePerdida > 0) parts.push(`${quantidadePerdida}x Perdido`);

        await this.auditLogService.log(
          userId ?? null,
          userEmail ?? null,
          'DEVOLVER',
          'checklist_item',
          item.id,
          {
            equipmentNome: item.nomeSnapshot,
            observacao: observacao ?? null,
            quantidadeOk,
            quantidadeDanificada,
            quantidadePerdida,
            quantidadeAnterior: anterior,
            quantidadeNova: item.quantidadeDevolvida,
          },
          `Devolvido "${item.nomeSnapshot}": ${parts.join(', ')}`,
        );

        const mensagens: string[] = [];
        if (quantidadeOk > 0) mensagens.push(`${quantidadeOk}x OK (estoque atualizado)`);
        if (quantidadeDanificada > 0) mensagens.push(`${quantidadeDanificada}x Danificado (aguardando confirmação)`);
        if (quantidadePerdida > 0) mensagens.push(`${quantidadePerdida}x Perdido (aguardando confirmação)`);

        return {
          mensagem: `Devolução registrada: ${mensagens.join(', ')}.`,
          item: updatedItem,
        };
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        console.error('[DEVOLVER] Erro inesperado:', error);
        throw new BadRequestException(
          'Erro interno ao processar a devolução. Tente novamente.',
        );
      }
    });
  }

  // ==============================
  // STATUS AUTOMÁTICO DO CHECKLIST (transaction-aware)
  // ==============================
  private async atualizarStatusChecklistTx(
    manager: EntityManager,
    checklistId: number,
  ) {
    const checklist = await manager.findOne(Checklist, {
      where: { id: checklistId },
    });

    if (!checklist) return;

    // Não recalcular em status terminais
    if (['concluido', 'cancelado'].includes(checklist.status)) return;

    // RASCUNHO: NUNCA mudar automaticamente. Só o "Liberar Evento" promove para liberado.
    if (checklist.status === 'rascunho') return;
    
    // Busca os itens diretamente do banco para garantir dados frescos
    const items = await manager.find(ChecklistItem, {
      where: { checklistId },
    });

    // Se não tem itens, manter status atual (não rebaixar)
    if (!items.length) return;

    const todosSeparados = items.every(
      (i: ChecklistItem) => i.quantidadeSeparada === i.quantidadePlanejada,
    );

    const algumDevolvido = items.some(
      (i: ChecklistItem) => i.quantidadeDevolvida > 0,
    );

    const todosFinalizados = items.every(
      (i: ChecklistItem) =>
        i.quantidadeSeparada > 0 &&
        ['devolvido', 'quebrado', 'perdido'].includes(i.statusDevolucao),
    );

    const algumAguardando = items.some(
      (i: ChecklistItem) => i.statusDevolucao === 'aguardando_confirmacao',
    );

    if (todosFinalizados) {
      checklist.status = 'concluido';
    } else if (algumAguardando || algumDevolvido) {
      checklist.status = 'pendente_devolucao';
    } else if (todosSeparados) {
      checklist.status = 'em_evento';
    } else {
      // Nem tudo separado ainda: volta para liberado para que o funcionário
      // saiba que há itens novos ou alterados precisando de separação.
      checklist.status = 'liberado';
    }

    await manager.save(Checklist, checklist);
  }

  // ==============================
  // ATUALIZAR QUANTIDADE — rascunho ou liberado/em_evento
  // ==============================
  async updateQuantidade(
    itemId: number,
    quantidade: number,
    userId?: number,
    userEmail?: string,
  ) {
    if (quantidade <= 0) {
      throw new BadRequestException(
        'Quantidade inválida. Deve ser maior que zero.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(ChecklistItem, {
        where: { id: itemId },
        relations: ['checklist'],
      });

      if (!item) throw new BadRequestException('Item não encontrado.');

      const status = item.checklist.status;

      // 🔴 BLOQUEIO: quantidade planejada é IMUTÁVEL apenas em status terminal
      if (['concluido', 'cancelado'].includes(status)) {
        throw new BadRequestException(
          'Não é possível alterar quantidade de item em checklist concluído ou cancelado.',
        );
      }

      if (
        !['rascunho', 'liberado', 'em_evento', 'pendente_devolucao'].includes(status)
      ) {
        throw new BadRequestException(
          `Não é possível alterar quantidade de item em checklist com status "${status}".`,
        );
      }

      // Se a nova quantidade for menor que o já separado,
      // ajustar quantidadeSeparada para o novo valor
      // (o excesso é liberado automaticamente pelo delta de estoque)
      if (quantidade < item.quantidadeSeparada) {
        item.quantidadeSeparada = quantidade;
      }

      // 🔴 CORREÇÃO: Busca usando o manager para respeitar lock da transação
      const equipment = await manager.findOne(Equipment, {
        where: { id: item.equipmentId },
      });

      if (!equipment || !equipment.ativo) {
        throw new BadRequestException('Equipamento inválido ou inativo.');
      }

      const anterior = item.quantidadePlanejada;
      const delta = quantidade - anterior;

      // 🛑 VALIDAÇÃO DE INTEGRIDADE: Não pode reduzir planejamento abaixo do que já voltou
      const jaContabilizado = (item.quantidadeOk || 0) + (item.quantidadeQuebrada || 0) + (item.quantidadePerdida || 0);
      if (quantidade < jaContabilizado) {
        throw new BadRequestException(
          `Não é possível reduzir para ${quantidade} unidades pois ${jaContabilizado} já foram devolvidas/baixadas (OK/QB/PD).`,
        );
      }

      if (status !== 'rascunho') {
        // Checklist com estoque reservado: ajustar conforme delta
        if (delta > 0) {
          // Validar se há estoque disponível suficiente
          if (delta > equipment.quantidadeDisponivel) {
            throw new BadRequestException(
              `Estoque insuficiente. Disponível: ${equipment.quantidadeDisponivel}, solicitado: ${delta} unidades a mais.`,
            );
          }
          await this.stockService.reservarEstoque(
            manager,
            item.equipmentId,
            delta,
          );
        } else if (delta < 0) {
          await this.stockService.liberarReserva(
            manager,
            item.equipmentId,
            Math.abs(delta),
          );
        }
      } else {
        // Rascunho: sem reserva de estoque, mas validar disponibilidade
        if (quantidade > equipment.quantidadeDisponivel) {
          throw new BadRequestException(
            `Estoque insuficiente. Disponível: ${equipment.quantidadeDisponivel}, solicitado: ${quantidade}.`,
          );
        }
      }

      item.quantidadePlanejada = quantidade;

      // Recalcular statusSeparacao: se a nova quantidade excede o separado,
      // o item volta a ficar pendente (precisa separar mais)
      if (item.quantidadeSeparada >= quantidade) {
        item.statusSeparacao = 'separado';
      } else {
        item.statusSeparacao = 'pendente';
      }

      await manager.save(ChecklistItem, item);

      // Recalcular status do checklist (pode voltar de em_evento → liberado)
      await this.atualizarStatusChecklistTx(manager, item.checklistId);

      // Notificar funcionários sobre a mudança de quantidade (somente em status ativo)
      if (status !== 'rascunho' && delta !== 0) {
        const checklist = await manager.findOne(Checklist, {
          where: { id: item.checklistId },
        });
        await this.notificationService.notificarFuncionarios(
          delta > 0 ? 'QUANTIDADE_AUMENTADA' : 'QUANTIDADE_DIMINUIDA',
          item.checklistId,
          checklist?.nome ?? `Checklist #${item.checklistId}`,
          item.nomeSnapshot,
          anterior,
          quantidade,
        );
      }

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'UPDATE',
        'checklist_item',
        item.id,
        { 
          quantidadeAnterior: anterior, 
          quantidadeNova: quantidade, 
          delta,
          jaContabilizado,
          estoquePos: { disponivel: equipment.quantidadeDisponivel, emUso: equipment.quantidadeEmUso }
        },
        `Quantidade atualizada: ${anterior} → ${quantidade} (Delta estoque: ${delta > 0 ? '+' : ''}${delta})`,
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

      if (!['rascunho', 'liberado', 'em_evento', 'pendente_devolucao'].includes(status)) {
        throw new BadRequestException(
          `Só é possível remover itens de checklist em rascunho, liberado, em evento ou pendente de devolução. Status atual: "${status}".`,
        );
      }

      // Se ativo: reverter a reserva de estoque correspondente ao que ainda está "em uso"
      if (status !== 'rascunho' && status !== 'cancelado') {
        const jaDevolvidoOuBaixado = (item.quantidadeOk || 0) + (item.quantidadeQuebrada || 0) + (item.quantidadePerdida || 0);
        const emUsoNoItem = item.quantidadePlanejada - jaDevolvidoOuBaixado;
        
        if (emUsoNoItem > 0) {
          await this.stockService.liberarReserva(
            manager,
            item.equipmentId,
            emUsoNoItem,
          );
        }
      }

      await manager.delete(ChecklistItem, itemId);

      // Recalcular status do checklist após remoção
      await this.atualizarStatusChecklistTx(manager, item.checklistId);

      // Notificar funcionários sobre remoção (somente em status ativo)
      if (status !== 'rascunho') {
        const checklist = await manager.findOne(Checklist, {
          where: { id: item.checklistId },
        });
        await this.notificationService.notificarFuncionarios(
          'EQUIPAMENTO_REMOVIDO',
          item.checklistId,
          checklist?.nome ?? `Checklist #${item.checklistId}`,
          item.nomeSnapshot,
        );
      }

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'DELETE',
        'checklist_item',
        itemId,
        { equipmentNome: item.nomeSnapshot, checklistId: item.checklistId, status },
        `Item "${item.nomeSnapshot}" removido do checklist (status: ${status})`,
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

    return this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(ChecklistItem, {
        where: { id: itemId },
        relations: ['checklist'],
      });

      if (!item) throw new BadRequestException('Item não encontrado.');

      if (item.checklist.status !== 'rascunho') {
        throw new BadRequestException(
          'Troca de equipamento só é permitida em checklist rascunho.',
        );
      }

      const equipment = await manager.findOne(Equipment, {
        where: { id: equipmentId },
      });

      if (!equipment || !equipment.ativo) {
        throw new BadRequestException('Equipamento inválido ou inativo.');
      }

      if (quantidade > equipment.quantidadeDisponivel) {
        throw new BadRequestException(
          `Estoque insuficiente para "${equipment.nome}". Disponível: ${equipment.quantidadeDisponivel}.`,
        );
      }

      const nomeAnterior = item.nomeSnapshot;
      item.equipmentId = equipment.id;
      item.nomeSnapshot = equipment.nome;
      item.descricaoSnapshot = equipment.descricao;
      item.quantidadePlanejada = quantidade;

      const saved = await manager.save(ChecklistItem, item);

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
    });
  }

  async cancelarSeparacao(
    itemId: number,
    quantidade: number,
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
        if (quantidade <= 0)
          throw new BadRequestException('Quantidade inválida.');

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

        item.quantidadeSeparada -= quantidade;
        item.statusSeparacao =
          item.quantidadeSeparada === item.quantidadePlanejada
            ? 'separado'
            : 'pendente';

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
          {
            quantidadeAnterior: anterior,
            quantidadeNova: item.quantidadeSeparada,
          },
          `Separação cancelada: ${quantidade}x "${item.nomeSnapshot}"`,
        );

        return { mensagem: 'Separação cancelada com sucesso.', item };
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        console.error('[CANCELAR_SEPARACAO] Erro inesperado:', error);
        throw new BadRequestException(
          'Erro interno ao cancelar a separação. Tente novamente.',
        );
      }
    });
  }

  // ==============================
  // APROVAR TODAS AS OCORRÊNCIAS PENDENTES DE UM CHECKLIST
  // ==============================
  /**
   * Admin confirma (BAIXA) todas as ocorrências pendentes de um checklist.
   * Stock changes happen INSIDE confirmarBaixa() via the occurrence service.
   */
  async aprovarTodosPendentes(
    checklistId: number,
    userId?: number,
    userEmail?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      // Find all checklist items for this checklist
      const items = await manager.find(ChecklistItem, {
        where: { checklistId },
      });

      if (items.length === 0) {
        throw new BadRequestException('Nenhum item neste checklist.');
      }

      const itemIds = items.map((i) => i.id);

      // Find all PENDENTE occurrences linked to these items
      const pendentes = await manager
        .createQueryBuilder(EquipmentOccurrence, 'occ')
        .leftJoinAndSelect('occ.equipment', 'equipment')
        .where('occ.checklistItemId IN (:...itemIds)', { itemIds })
        .andWhere('occ.status = :status', { status: 'PENDENTE' })
        .getMany();

      if (pendentes.length === 0) {
        throw new BadRequestException(
          'Nenhuma ocorrência pendente de aprovação neste checklist.',
        );
      }

      const resultados: { occurrenceId: number; tipo: string; quantidade: number }[] = [];

      for (const occ of pendentes) {
        const { tipo, quantidade } = occ;

        // Re-read equipment with lock — quantities change between iterations
        const eqLocked = await manager.findOne(Equipment, {
          where: { id: occ.equipment.id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!eqLocked) {
          throw new BadRequestException(
            `Equipamento ID ${occ.equipment.id} não encontrado.`,
          );
        }

        if (tipo === 'DANO') {
          if (occ.manual) {
            // Manual: disponivel -= qty, danificada += qty
            await this.stockService.registrarDanoManual(
              manager,
              eqLocked.id,
              quantidade,
            );
          } else {
            // Checklist-generated: emUso -= qty, danificada += qty
            await this.stockService.registrarDevolucaoDanificado(
              manager,
              eqLocked.id,
              quantidade,
            );
          }
        } else if (tipo === 'PERDA') {
          if (occ.manual) {
            // Manual: disponivel -= qty, perdida += qty, total -= qty
            await this.stockService.registrarPerdaManual(
              manager,
              eqLocked.id,
              quantidade,
            );
          } else {
            // Checklist-generated: emUso -= qty, perdida += qty, total -= qty
            await this.stockService.registrarDevolucaoPerdido(
              manager,
              eqLocked.id,
              quantidade,
            );
          }
        }

        occ.status = 'BAIXADO';
        await manager.save(EquipmentOccurrence, occ);

        resultados.push({
          occurrenceId: occ.id,
          tipo: occ.tipo,
          quantidade: occ.quantidade,
        });
      }

      // Sincronizar todos os itens do checklist após as confirmações
      for (const item of items) {
        await this.occurrenceService.syncChecklistItemFromOccurrences(
          manager,
          item.id,
        );
      }

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'APROVAR_TUDO',
        'checklist',
        checklistId,
        { resultados },
        `Aprovadas ${pendentes.length} ocorrências do checklist #${checklistId}`,
      );

      return {
        mensagem: `${pendentes.length} ocorrência(s) confirmada(s) e estoque ajustado.`,
        resultados,
      };
    });
  }

  private async verificarConflitoEventosTx(
    manager: EntityManager,
    equipmentId: number,
    checklistId: number,
  ) {
    try {
      // Find the equipment physical total
      const equipment = await manager.findOne(Equipment, {
        where: { id: equipmentId },
      });
      if (!equipment) return null;

      // Find the event that owns this checklist
      const checklist = await manager.findOne(Checklist, {
        where: { id: checklistId },
        relations: ['event'],
      });

      const eventoAtual = checklist?.event;
      if (!eventoAtual) return null;

      // Find other active events with date overlap
      const outrosEventos = await manager
        .createQueryBuilder(Event, 'event')
        .leftJoinAndSelect('event.checklists', 'checklists')
        .leftJoinAndSelect('checklists.items', 'items')
        .where('event.id != :id', { id: eventoAtual.id })
        .andWhere('event.status NOT IN (:...status)', {
          status: ['finalizado', 'cancelado'],
        })
        .andWhere('(event.dataInicio <= :fim AND event.dataFim >= :inicio)', {
          inicio: eventoAtual.dataInicio,
          fim: eventoAtual.dataFim,
        })
        .andWhere('items.equipmentId = :equipmentId', { equipmentId })
        .getMany();

      if (!outrosEventos.length) return null;

      // Calculate total needed across all overlapping events
      const totalSoma = outrosEventos.reduce((acc, ev) => {
        const itemQty = ev.checklists?.reduce((accCl, cl) => {
          const item = cl.items?.find((i) => i.equipmentId === equipmentId);
          return accCl + (item?.quantidadePlanejada ?? 0);
        }, 0);
        return acc + (itemQty ?? 0);
      }, 0);

      // Add current event quantity
      const itemAtual = await manager.findOne(ChecklistItem, {
        where: { checklistId, equipmentId },
      });
      const totalComAtual = totalSoma + (itemAtual?.quantidadePlanejada ?? 0);

      // Only warn if deficit exists
      if (totalComAtual > equipment.quantidadeTotal) {
        const eventoConflito = outrosEventos[0].nome;
        return `⚠ Conflito de estoque: O evento "${eventoConflito}" também precisa deste item. Total necessário (${totalComAtual}) excede o estoque físico (${equipment.quantidadeTotal}).`;
      }

      return null;
    } catch (error) {
      console.warn('[SEPARAR] Falha ao verificar conflito de eventos:', error);
      return null;
    }
  }
}
