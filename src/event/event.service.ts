import { Event } from './event.entity';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Checklist } from '../checklist/checklist.entity';
import { ChecklistItem } from '../checklist-item/checklist-item.entity';
import { DataSource, Repository } from 'typeorm';
import { EquipmentOccurrence } from '../equipment-occurrence/equipment-occurrence.entity';
import { Equipment } from '../equipment/equipment.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventTeamDto } from './dto/create-event-team.dto';
import { UpdateEventTeamDto } from './dto/update-event-team.dto';
import { EventTeam } from './event-team.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { StockService } from '../stock/stock.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class EventService {
  constructor(
    @InjectRepository(Event)
    private repo: Repository<Event>,

    @InjectRepository(Checklist)
    private checklistRepo: Repository<Checklist>,

    @InjectRepository(ChecklistItem)
    private checklistItemRepo: Repository<ChecklistItem>,

    @InjectRepository(EventTeam)
    private readonly teamRepo: Repository<EventTeam>,

    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
    private readonly stockService: StockService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(dto: CreateEventDto, userId?: number, userEmail?: string) {
    // Validação de datas
    this.validarDatas(dto.dataInicio, dto.dataFim);

    const event = this.repo.create({
      nome: dto.nome,
      cliente: dto.cliente,
      local: dto.local,
      dataInicio: new Date(dto.dataInicio),
      dataFim: new Date(dto.dataFim),
      observacoes: dto.observacoes,
      equipe: dto.equipe,
    });

    const saved = await this.repo.save(event);

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'CREATE',
      'event',
      saved.id,
      { nome: dto.nome, cliente: dto.cliente, local: dto.local },
      `Evento "${dto.nome}" criado`,
    );

    return saved;
  }

  async findAll(userRole?: string, page = 1, limit = 20, showArchived = false) {
    const query = this.repo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.checklists', 'checklists')
      .leftJoinAndSelect('event.equipe', 'equipe')
      .orderBy('event.dataInicio', 'DESC');

    // Toggle between active and archived events
    if (showArchived) {
      query.andWhere('event.arquivado = :arq', { arq: true });
    } else {
      query.andWhere('event.arquivado = :arq', { arq: false });
    }

    // FUNCIONÁRIO: só vê eventos "liberados" para a equipe que NÃO estejam arquivados ou cancelados
    if (userRole === 'FUNCIONARIO') {
      query.andWhere('event.arquivado = :arq', { arq: false });
      query.andWhere('event.status != :status', { status: 'cancelado' });
      query.andWhere(
        `event.id IN (
          SELECT c."eventId"
          FROM checklist c
          WHERE c.status IN ('liberado', 'em_evento', 'pendente_devolucao', 'concluido')
        )`,
      );
    }

    query.skip((page - 1) * limit).take(limit);

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number) {
    const event = await this.repo.findOne({
      where: { id },
      relations: ['checklists', 'checklists.items', 'equipe'],
    });

    if (!event) throw new BadRequestException('Evento não encontrado.');

    return event;
  }

  async adicionarEquipe(eventId: number, dto: CreateEventTeamDto) {
    const event = await this.repo.findOne({
      where: { id: eventId },
      relations: ['equipe'],
    });

    if (!event) throw new BadRequestException('Evento não encontrado.');

    const membro = this.teamRepo.create({
      nome: dto.nome,
      funcao: dto.funcao,
      event,
    });
    return this.teamRepo.save(membro);
  }

  async listarEquipe(eventId: number) {
    const event = await this.repo.findOne({
      where: { id: eventId },
      relations: ['equipe'],
    });

    if (!event) throw new BadRequestException('Evento não encontrado.');
    return event.equipe;
  }

  async editarEquipe(id: number, dto: UpdateEventTeamDto) {
    const membro = await this.teamRepo.findOne({ where: { id } });
    if (!membro) throw new BadRequestException('Membro não encontrado.');

    if (dto.nome !== undefined) membro.nome = dto.nome;
    if (dto.funcao !== undefined) membro.funcao = dto.funcao;

    return this.teamRepo.save(membro);
  }

  async removerEquipe(id: number) {
    const membro = await this.teamRepo.findOne({ where: { id } });
    if (!membro) throw new BadRequestException('Membro não encontrado.');
    await this.teamRepo.delete(id);
    return { message: 'Membro removido com sucesso.' };
  }

  async finalizar(id: number, userId?: number, userEmail?: string) {
    const event = await this.repo.findOne({
      where: { id },
      relations: ['checklists'],
    });

    if (!event) throw new BadRequestException('Evento não encontrado.');
    if (event.status === 'finalizado')
      throw new BadRequestException('Evento já está finalizado.');
    if (event.status === 'cancelado') {
      // 🔴 Evento cancelado PODE ser finalizado (marca como completo, sem mais edições)
      event.status = 'finalizado';
      event.finalizadoPor = userEmail ?? undefined;
      event.finalizadoEm = new Date();
      const saved = await this.repo.save(event);

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'FINALIZAR',
        'event',
        id,
        { status: 'cancelado → finalizado' },
        `Evento cancelado "${event.nome}" finalizado`,
      );

      return saved;
    }

    const checklistsAtivos = (event.checklists ?? []).filter(
      (cl) => !['concluido', 'cancelado'].includes(cl.status),
    );

    if (checklistsAtivos.length > 0) {
      const nomes = checklistsAtivos
        .map((cl) => `"${cl.nome}" (${cl.status})`)
        .join(', ');
      throw new BadRequestException(
        `Não é possível finalizar. Checklist ainda pendente: ${nomes}`,
      );
    }

    event.status = 'finalizado';
    event.finalizadoPor = userEmail ?? undefined;
    event.finalizadoEm = new Date();

    const saved = await this.repo.save(event);

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'FINALIZAR',
      'event',
      id,
      { status: 'ativo → finalizado' },
      `Evento "${event.nome}" finalizado`,
    );

    // Notificar funcionários
    await this.notificationService.notificarEvento(
      'EVENTO_FINALIZADO',
      `Evento "${event.nome}" foi finalizado. O checklist foi concluído.`,
    );

    return saved;
  }

  /**
   * CANCELAR EVENTO: Reverte todas as reservas de estoque ativas.
   * Checklist vinculado tambem e cancelado e seus itens voltam ao estoque.
   *
   * INFALIVEL — usa ajuste direto com Math.min para nunca falhar por inconsistencia.
   */
  async cancelar(
    id: number,
    motivo: string,
    userId?: number,
    userEmail?: string,
  ) {
    if (!motivo || motivo.trim().length === 0) {
      throw new BadRequestException('Motivo do cancelamento e obrigatorio.');
    }

    return this.dataSource.transaction(async (manager) => {
      const event = await manager.findOne(Event, {
        where: { id },
        relations: ['checklists', 'checklists.items'],
      });

      if (!event) throw new BadRequestException('Evento nao encontrado.');

      if (event.status === 'cancelado')
        throw new BadRequestException('Evento ja esta cancelado.');
      if (event.status === 'finalizado')
        throw new BadRequestException(
          'Nao e possivel cancelar evento finalizado.',
        );

      // Reverte reservas de estoque e cancela o checklist
      for (const checklist of event.checklists ?? []) {
        if (['cancelado', 'concluido'].includes(checklist.status)) continue;

        // Checklist em rascunho não tem reserva de estoque, apenas cancelar
        if (checklist.status === 'rascunho') {
          await manager.update(Checklist, checklist.id, {
            status: 'cancelado',
            motivoCancelamento: `Evento cancelado: ${motivo}`,
            canceladoPor: userEmail ?? 'admin',
            canceladoEm: new Date(),
          });
          continue;
        }

        const items = await manager.find(ChecklistItem, {
          where: { checklistId: checklist.id },
        });

        for (const item of items) {
          const equipment = await manager.findOne(Equipment, {
            where: { id: item.equipmentId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!equipment) continue;

          let aLiberar = 0;

          if (checklist.status === 'liberado') {
            aLiberar = item.quantidadePlanejada;
          } else if (
            ['em_evento', 'pendente_devolucao'].includes(checklist.status)
          ) {
            const occurrences = await manager.find(EquipmentOccurrence, {
              where: { checklistItemId: item.id },
            });
            const baixadoDano = occurrences
              .filter(o => o.status === 'BAIXADO' && o.tipo === 'DANO')
              .reduce((sum, o) => sum + o.quantidade, 0);
            const baixadoPerda = occurrences
              .filter(o => o.status === 'BAIXADO' && o.tipo === 'PERDA')
              .reduce((sum, o) => sum + o.quantidade, 0);
            const totalSaiuDeEmUso = (item.quantidadeOk || 0) + baixadoDano + baixadoPerda;
            aLiberar = item.quantidadePlanejada - totalSaiuDeEmUso;

            // Cancelar ocorrencias PENDENTES vinculadas a este item
            const pendentes = occurrences.filter(o => o.status === 'PENDENTE');
            for (const occ of pendentes) {
              occ.status = 'CANCELADO';
              await manager.save(EquipmentOccurrence, occ);
            }
          }

          // Ajuste direto e seguro: nunca liberar mais que o emUso real
          if (aLiberar > 0) {
            const liberarReal = Math.min(aLiberar, equipment.quantidadeEmUso);
            if (liberarReal > 0) {
              equipment.quantidadeDisponivel += liberarReal;
              equipment.quantidadeEmUso -= liberarReal;
              await manager.save(Equipment, equipment);
            }
          }
        }

        await manager.update(Checklist, checklist.id, {
          status: 'cancelado',
          motivoCancelamento: `Evento cancelado: ${motivo}`,
          canceladoPor: userEmail ?? 'admin',
          canceladoEm: new Date(),
        });
      }

      event.status = 'cancelado';
      event.motivoCancelamento = motivo;
      event.canceladoPor = userEmail ?? undefined;
      event.canceladoEm = new Date();
      
      // Cancelled event = Finalized event
      event.finalizadoPor = userEmail ?? undefined;
      event.finalizadoEm = new Date();

      const saved = await manager.save(Event, event);

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'CANCELAR',
        'event',
        id,
        { motivo, status: 'cancelado' },
        `Evento "${event.nome}" cancelado: ${motivo}`,
      );

      // Notificar funcionários
      await this.notificationService.notificarEvento(
        'EVENTO_CANCELADO',
        `Evento "${event.nome}" foi cancelado. Motivo: ${motivo}`,
      );

      return saved;
    });
  }

  /**
   * REATIVAR EVENTO: Desfaz o cancelamento.
   * Evento volta para 'ativo' e checklist volta para 'rascunho'.
   */
  async reativar(id: number, userId?: number, userEmail?: string) {
    return this.dataSource.transaction(async (manager) => {
      const event = await manager.findOne(Event, {
        where: { id },
        relations: ['checklists'],
      });

      if (!event) throw new BadRequestException('Evento não encontrado.');

      if (event.status !== 'cancelado') {
        throw new BadRequestException('Apenas eventos cancelados podem ser reativados.');
      }

      // Reativar checklist: volta para rascunho
      if (event.checklists) {
        for (const checklist of event.checklists) {
          await manager.update(Checklist, checklist.id, {
            status: 'rascunho',
            motivoCancelamento: undefined,
            canceladoPor: undefined,
            canceladoEm: undefined,
          });
        }
      }

      // Reativar evento
      event.status = 'ativo';
      event.motivoCancelamento = undefined;
      event.canceladoPor = undefined;
      event.canceladoEm = undefined;
      event.finalizadoPor = undefined;
      event.finalizadoEm = undefined;

      const saved = await manager.save(Event, event);

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'REATIVAR',
        'event',
        id,
        { status: 'ativo', checklists: 'rascunho' },
        `Evento "${event.nome}" reativado. Checklist voltou para rascunho.`,
      );

      return saved;
    });
  }

  /**
   * LIBERAR EVENTO: Libera o checklist elegivel e garante reserva de estoque.
   *
   * Dois cenarios:
   * 1) Checklist em 'rascunho' com itens -> reserva tudo, promove para 'liberado'
   * 2) Checklist ja em 'liberado' -> verifica se TODOS os itens tem estoque reservado
   *    (corrige situacoes onde itens foram adicionados antes da liberacao e ficaram sem reserva)
   */
  async liberarEvento(id: number, userId?: number, userEmail?: string) {
    return this.dataSource.transaction(async (manager) => {
      const event = await manager.findOne(Event, {
        where: { id },
        relations: ['checklists'],
      });

      if (!event) throw new BadRequestException('Evento nao encontrado.');
      if (event.arquivado) throw new BadRequestException('Nao e possivel liberar evento arquivado.');
      if (event.status !== 'ativo') {
        throw new BadRequestException(`Apenas eventos ativos podem ser liberados. Status atual: ${event.status}`);
      }

      let totalLiberados = 0;
      let totalItensCorrigidos = 0;

      for (const checklist of event.checklists ?? []) {
        // Carregar itens diretamente do banco para garantir dados frescos
        const items = await manager.find(ChecklistItem, {
          where: { checklistId: checklist.id },
        });

        if (items.length === 0) continue;

        if (checklist.status === 'rascunho') {
          // === CENARIO 1: Checklist em rascunho -> reservar tudo ===
          // Primeiro: agrupa quantidades por equipamento
          const mapa = new Map<number, number>();
          for (const item of items) {
            const atual = mapa.get(item.equipmentId) ?? 0;
            mapa.set(item.equipmentId, atual + item.quantidadePlanejada);
          }

          // Segundo: PRÉ-VALIDAR estoque de TODOS os equipamentos antes de reservar
          const bloqueios: { nome: string; disponivel: number; solicitado: number }[] = [];
          for (const [equipmentId, quantidade] of mapa.entries()) {
            const equipment = await manager.findOne(Equipment, {
              where: { id: equipmentId },
              lock: { mode: 'pessimistic_write' },
            });
            if (!equipment) continue;
            if (quantidade > equipment.quantidadeDisponivel) {
              bloqueios.push({
                nome: equipment.nome,
                disponivel: equipment.quantidadeDisponivel,
                solicitado: quantidade,
              });
            }
          }

          if (bloqueios.length > 0) {
            const detalhes = bloqueios
              .map(b => `• ${b.nome}: disponível ${b.disponivel}, solicitado ${b.solicitado} (faltam ${b.solicitado - b.disponivel})`)
              .join('\n');
            throw new BadRequestException(
              `Não é possível liberar o evento. Equipamentos com estoque insuficiente:\n${detalhes}`,
            );
          }

          // Terceiro: reservar estoque (já validado, não deve falhar)
          for (const [equipmentId, quantidade] of mapa.entries()) {
            await this.stockService.reservarEstoque(
              manager,
              equipmentId,
              quantidade,
            );
          }

          checklist.status = 'liberado';
          await manager.save(Checklist, checklist);
          totalLiberados++;
        }
      }

      if (totalLiberados === 0) {
        throw new BadRequestException(
          'Nenhum checklist em rascunho com itens encontrado para liberar.',
        );
      }

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'LIBERAR_EVENTO',
        'event',
        id,
        { checklistsLiberados: totalLiberados, itensCorrigidos: totalItensCorrigidos },
        `Evento "${event.nome}" liberado (${totalLiberados} checklist)`,
      );

      // Notificar funcionários
      await this.notificationService.notificarEvento(
        'EVENTO_LIBERADO',
        `Evento "${event.nome}" foi liberado! Checklist pronto para separação.`,
      );

      return {
        message: `Checklist liberado com sucesso.`,
      };
    });
  }
  /**
   * ARQUIVAR EVENTO: Move para lixeira.
   * - Libera TODO o estoque reservado do checklist
   * - Reseta o checklist (exceto cancelado) para 'rascunho'
   * - Reseta campos de separacao/devolucao dos itens
   *
   * NOTA: Este metodo e INFALIVEL — nunca deve falhar por inconsistencia de estoque.
   * Usa ajuste direto com Math.min em vez de guards rigidos do StockService.
   */
  async arquivar(id: number, userId?: number, userEmail?: string) {
    return this.dataSource.transaction(async (manager) => {
      const event = await manager.findOne(Event, {
        where: { id },
        relations: ['checklists', 'checklists.items'],
      });

      if (!event) throw new BadRequestException('Evento nao encontrado.');
      if (event.arquivado) throw new BadRequestException('Evento ja esta arquivado.');

      // Apenas eventos finalizados, cancelados ou previamente finalizados (restaurados) podem ser arquivados
      if (!['finalizado', 'cancelado'].includes(event.status) && !event.foiFinalizadoPreviamente) {
        throw new BadRequestException(
          'Apenas eventos finalizados ou cancelados podem ser arquivados.',
        );
      }

      // === LIBERAR ESTOQUE do checklist que tem reserva ===
      for (const checklist of event.checklists ?? []) {
        // Rascunho: nunca reservou estoque. Cancelado/Concluído: estoque ja devolvido.
        if (['rascunho', 'cancelado', 'concluido'].includes(checklist.status)) continue;

        const items = await manager.find(ChecklistItem, {
          where: { checklistId: checklist.id },
        });

        for (const item of items) {
          // Buscar equipamento com lock para ajuste direto
          const equipment = await manager.findOne(Equipment, {
            where: { id: item.equipmentId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!equipment) continue;

          let aLiberar = 0;

          if (checklist.status === 'liberado') {
            // Liberado: estoque totalmente em emUso, nada separado/devolvido
            aLiberar = item.quantidadePlanejada;
          } else if (['em_evento', 'pendente_devolucao'].includes(checklist.status)) {
            // Em evento/pendente: calcular emUso restante
            const occurrences = await manager.find(EquipmentOccurrence, {
              where: { checklistItemId: item.id },
            });
            const baixadoDano = occurrences
              .filter(o => o.status === 'BAIXADO' && o.tipo === 'DANO')
              .reduce((sum, o) => sum + o.quantidade, 0);
            const baixadoPerda = occurrences
              .filter(o => o.status === 'BAIXADO' && o.tipo === 'PERDA')
              .reduce((sum, o) => sum + o.quantidade, 0);
            const totalSaiuDeEmUso = (item.quantidadeOk || 0) + baixadoDano + baixadoPerda;
            aLiberar = item.quantidadePlanejada - totalSaiuDeEmUso;

            // Cancelar ocorrencias PENDENTES vinculadas a este item
            const pendentes = occurrences.filter(o => o.status === 'PENDENTE');
            for (const occ of pendentes) {
              occ.status = 'CANCELADO';
              await manager.save(EquipmentOccurrence, occ);
            }
          }

          // Ajuste direto e seguro: nunca liberar mais que o emUso real do equipamento
          if (aLiberar > 0) {
            const liberarReal = Math.min(aLiberar, equipment.quantidadeEmUso);
            if (liberarReal > 0) {
              equipment.quantidadeDisponivel += liberarReal;
              equipment.quantidadeEmUso -= liberarReal;
              await manager.save(Equipment, equipment);
            }
          }

          // Resetar campos do item para estado inicial
          item.quantidadeSeparada = 0;
          item.quantidadeDevolvida = 0;
          item.quantidadeOk = 0;
          item.quantidadeQuebrada = 0;
          item.quantidadePerdida = 0;
          item.statusSeparacao = 'pendente';
          item.statusDevolucao = 'pendente';
          item.observacaoDevolucao = undefined;
          await manager.save(ChecklistItem, item);
        }
      }

      // === RESETAR CHECKLIST para rascunho (exceto cancelado) ===
      for (const checklist of event.checklists ?? []) {
        if (checklist.status === 'cancelado') continue; // manter cancelados como estao
        await manager.update(Checklist, checklist.id, {
          status: 'rascunho',
          motivoCancelamento: undefined,
          canceladoPor: undefined,
          canceladoEm: undefined,
        });
      }

      // === MARCAR EVENTO COMO ARQUIVADO ===
      event.arquivado = true;
      event.arquivadoPor = userEmail ?? undefined;
      event.arquivadoEm = new Date();

      // Marcar se o evento foi finalizado antes de ser arquivado
      if (event.status === 'finalizado' || event.status === 'cancelado') {
        event.foiFinalizadoPreviamente = true;
      }

      const saved = await manager.save(Event, event);

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'ARQUIVAR',
        'event',
        id,
        { arquivado: true },
        `Evento "${event.nome}" arquivado. Estoque liberado e checklist resetado.`,
      );

      return saved;
    });
  }
  /**
   * DESARQUIVAR EVENTO: Restaura da lixeira para a listagem ativa.
   * Checklist já foi resetado para 'rascunho' no arquivamento.
   * O admin precisará re-liberar o checklist para reservar estoque novamente.
   */
  async desarquivar(id: number, userId?: number, userEmail?: string) {
    return this.dataSource.transaction(async (manager) => {
      const event = await manager.findOne(Event, {
        where: { id },
        relations: ['checklists'],
      });

      if (!event) throw new BadRequestException('Evento não encontrado.');
      if (!event.arquivado) throw new BadRequestException('Evento não está arquivado.');

      // Restaurar evento
      event.arquivado = false;
      event.arquivadoPor = undefined;
      event.arquivadoEm = undefined;
      event.status = 'ativo'; // garantir que volta como ativo

      // Limpar campos de cancelamento/finalização caso existam
      event.motivoCancelamento = undefined;
      event.canceladoPor = undefined;
      event.canceladoEm = undefined;
      event.finalizadoPor = undefined;
      event.finalizadoEm = undefined;

      // NOTA: foiFinalizadoPreviamente NÃO é limpo aqui
      // Isso permite que o frontend restrinja as ações disponíveis

      // === GARANTIR que o checklist esteja em rascunho ===
      // (Redundância de segurança: arquivar já reseta, mas para eventos
      //  arquivados antes dessa lógica, forçamos o reset aqui também)
      if (event.checklists) {
        for (const checklist of event.checklists) {
          if (checklist.status === 'cancelado') continue; // manter cancelados
          await manager.update(Checklist, checklist.id, {
            status: 'rascunho',
            motivoCancelamento: undefined,
            canceladoPor: undefined,
            canceladoEm: undefined,
          });
        }
      }

      const saved = await manager.save(Event, event);

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'DESARQUIVAR',
        'event',
        id,
        { arquivado: false, status: 'ativo' },
        `Evento "${event.nome}" restaurado da lixeira. Checklist em rascunho.`,
      );

      return saved;
    });
  }

  /**
   * EXCLUIR PERMANENTE: Remove definitivamente o evento e todos os dados relacionados.
   * Libera todo o estoque que ainda estiver reservado antes de deletar.
   * INFALIVEL — usa ajuste direto com Math.min.
   */
  async excluirPermanente(id: number, userId?: number, userEmail?: string) {
    return this.dataSource.transaction(async (manager) => {
      const event = await manager.findOne(Event, {
        where: { id },
        relations: ['checklists', 'checklists.items', 'equipe'],
      });

      if (!event) throw new BadRequestException('Evento nao encontrado.');

      const nomeEvento = event.nome;

      // === LIBERAR ESTOQUE antes de deletar (para checklist que ainda tem reserva) ===
      for (const checklist of event.checklists ?? []) {
        if (['rascunho', 'cancelado', 'concluido'].includes(checklist.status)) continue;

        const items = await manager.find(ChecklistItem, {
          where: { checklistId: checklist.id },
        });

        for (const item of items) {
          const equipment = await manager.findOne(Equipment, {
            where: { id: item.equipmentId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!equipment) continue;

          let aLiberar = 0;

          if (checklist.status === 'liberado') {
            aLiberar = item.quantidadePlanejada;
          } else if (['em_evento', 'pendente_devolucao'].includes(checklist.status)) {
            const occurrences = await manager.find(EquipmentOccurrence, {
              where: { checklistItemId: item.id },
            });
            const baixadoDano = occurrences
              .filter(o => o.status === 'BAIXADO' && o.tipo === 'DANO')
              .reduce((sum, o) => sum + o.quantidade, 0);
            const baixadoPerda = occurrences
              .filter(o => o.status === 'BAIXADO' && o.tipo === 'PERDA')
              .reduce((sum, o) => sum + o.quantidade, 0);
            const totalSaiuDeEmUso = (item.quantidadeOk || 0) + baixadoDano + baixadoPerda;
            aLiberar = item.quantidadePlanejada - totalSaiuDeEmUso;

            // Cancelar ocorrencias PENDENTES
            const pendentes = occurrences.filter(o => o.status === 'PENDENTE');
            for (const occ of pendentes) {
              occ.status = 'CANCELADO';
              await manager.save(EquipmentOccurrence, occ);
            }
          }

          // Ajuste direto e seguro
          if (aLiberar > 0) {
            const liberarReal = Math.min(aLiberar, equipment.quantidadeEmUso);
            if (liberarReal > 0) {
              equipment.quantidadeDisponivel += liberarReal;
              equipment.quantidadeEmUso -= liberarReal;
              await manager.save(Equipment, equipment);
            }
          }
        }
      }

      // Deletar tudo (order matters for FK constraints)
      // 1. Deletar itens de checklist
      for (const checklist of event.checklists ?? []) {
        await manager.delete(ChecklistItem, { checklistId: checklist.id });
      }
      // 2. Deletar checklist
      for (const checklist of event.checklists ?? []) {
        await manager.delete(Checklist, { id: checklist.id });
      }
      // 3. Deletar equipe
      if (event.equipe?.length) {
        for (const membro of event.equipe) {
          await manager.delete(EventTeam, { id: membro.id });
        }
      }
      // 4. Deletar o evento
      await manager.delete(Event, { id });

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'EXCLUIR_PERMANENTE',
        'event',
        id,
        { nome: nomeEvento },
        `Evento "${nomeEvento}" excluído permanentemente`,
      );

      return { message: `Evento "${nomeEvento}" excluído permanentemente.` };
    });
  }


  async update(
    id: number,
    dto: Partial<CreateEventDto>,
    userId?: number,
    userEmail?: string,
  ) {
    const event = await this.repo.findOne({ where: { id } });

    if (!event) throw new BadRequestException('Evento não encontrado.');
    if (event.status === 'finalizado')
      throw new BadRequestException('Não é possível editar evento finalizado.');
    if (event.status === 'cancelado')
      throw new BadRequestException('Não é possível editar evento cancelado (cancelados são automaticamente finalizados).');

    if (dto.dataInicio !== undefined || dto.dataFim !== undefined) {
      const inicio = dto.dataInicio ?? event.dataInicio.toISOString();
      const fim = dto.dataFim ?? event.dataFim.toISOString();
      this.validarDatas(inicio, fim);
    }

    if (dto.nome !== undefined) event.nome = dto.nome;
    if (dto.cliente !== undefined) event.cliente = dto.cliente;
    if (dto.local !== undefined) event.local = dto.local;
    if (dto.dataInicio !== undefined)
      event.dataInicio = new Date(dto.dataInicio);
    if (dto.dataFim !== undefined) event.dataFim = new Date(dto.dataFim);
    if (dto.observacoes !== undefined) event.observacoes = dto.observacoes;

    const saved = await this.repo.save(event);

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'UPDATE',
      'event',
      id,
      dto as any,
      `Evento "${event.nome}" atualizado`,
    );

    return saved;
  }

  private validarDatas(dataInicio: string, dataFim: string): void {
    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);

    if (isNaN(inicio.getTime())) {
      throw new BadRequestException('Data de início inválida.');
    }
    if (isNaN(fim.getTime())) {
      throw new BadRequestException('Data de fim inválida.');
    }
    if (inicio > fim) {
      throw new BadRequestException(
        'Data de início deve ser anterior ou igual à data de fim do evento.',
      );
    }
  }

  async clonar(id: number, userId?: number, userEmail?: string) {
    const original = await this.repo.findOne({
      where: { id },
      relations: ['checklists', 'equipe'],
    });

    if (!original) throw new BadRequestException('Evento não encontrado.');

    const novoEvento = this.repo.create({
      nome: `${original.nome} (cópia)`,
      cliente: original.cliente,
      local: original.local,
      dataInicio: original.dataInicio,
      dataFim: original.dataFim,
      observacoes: original.observacoes,
      status: 'ativo',
    });
    const eventoSalvo = await this.repo.save(novoEvento);

    for (const m of original.equipe ?? []) {
      await this.teamRepo.save(
        this.teamRepo.create({
          nome: m.nome,
          funcao: m.funcao,
          event: eventoSalvo,
        }),
      );
    }

    const alertasEstoque: any[] = [];

    for (const cl of original.checklists ?? []) {
      const novoCl = await this.checklistRepo.save(
        this.checklistRepo.create({
          nome: `${cl.nome} (cópia)`,
          status: 'rascunho',
          eventId: eventoSalvo.id,
        }),
      );

      const items = await this.checklistItemRepo.find({
        where: { checklistId: cl.id },
      });

      for (const item of items) {
        const nameSnapshot = item.nomeSnapshot;
        const descricaoSnapshot = item.descricaoSnapshot;

        await this.checklistItemRepo.save(
          this.checklistItemRepo.create({
            checklistId: novoCl.id,
            equipmentId: item.equipmentId,
            nomeSnapshot: nameSnapshot,
            descricaoSnapshot: descricaoSnapshot,
            quantidadePlanejada: item.quantidadePlanejada,
            setor: item.setor,
          }),
        );
      }
    }

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'CLONAR',
      'event',
      eventoSalvo.id,
      { originalId: id },
      `Evento clonado de "${original.nome}"`,
    );

    return { evento: eventoSalvo };
  }

  async arquivarLote(ids: number[], userId?: number, userEmail?: string) {
    const results: { id: number; status: string; message?: string }[] = [];
    for (const id of ids) {
      try {
        await this.arquivar(id, userId, userEmail);
        results.push({ id, status: 'success' });
      } catch (err) {
        results.push({ id, status: 'error', message: err.message });
      }
    }
    return results;
  }

  async excluirLote(ids: number[], userId?: number, userEmail?: string) {
    const results: { id: number; status: string; message?: string }[] = [];
    for (const id of ids) {
      try {
        await this.excluirPermanente(id, userId, userEmail);
        results.push({ id, status: 'success' });
      } catch (err) {
        results.push({ id, status: 'error', message: err.message });
      }
    }
    return results;
  }
}
