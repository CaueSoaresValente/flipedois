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

    // Filter archived events by default
    if (!showArchived) {
      query.andWhere('event.arquivado = :arq', { arq: false });
    }

    // FUNCIONÁRIO: só vê eventos "liberados" para a equipe
    if (userRole === 'FUNCIONARIO') {
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
        `Não é possível finalizar. Checklists ainda pendentes: ${nomes}`,
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

    return saved;
  }

  /**
   * CANCELAR EVENTO: Reverte todas as reservas de estoque ativas.
   *
   * Para cada checklist liberado/em_evento:
   *   - Reverte quantidades planejadas de volta ao disponível
   *   - Define checklist como cancelado
   * Define evento como cancelado.
   */
  async cancelar(
    id: number,
    motivo: string,
    userId?: number,
    userEmail?: string,
  ) {
    if (!motivo || motivo.trim().length === 0) {
      throw new BadRequestException('Motivo do cancelamento é obrigatório.');
    }

    return this.dataSource.transaction(async (manager) => {
      const event = await manager.findOne(Event, {
        where: { id },
        relations: ['checklists', 'checklists.items'],
      });

      if (!event) throw new BadRequestException('Evento não encontrado.');

      if (event.status === 'cancelado')
        throw new BadRequestException('Evento já está cancelado.');
      if (event.status === 'finalizado')
        throw new BadRequestException(
          'Não é possível cancelar evento finalizado.',
        );

      // Reverte reservas de estoque para checklists ativos
      for (const checklist of event.checklists ?? []) {
        if (['cancelado', 'concluido'].includes(checklist.status)) continue;

        const items = await manager.find(ChecklistItem, {
          where: { checklistId: checklist.id },
        });

        for (const item of items) {
          if (checklist.status === 'liberado') {
            // Stock foi reservado na liberação — reverter tudo
            await this.stockService.liberarReserva(
              manager,
              item.equipmentId,
              item.quantidadePlanejada,
            );
          } else if (
            ['em_evento', 'pendente_devolucao'].includes(checklist.status)
          ) {
            // Calcular o que REALMENTE saiu de emUso:
            // - OK → saiu de emUso via registrarDevolucaoOk
            // - DANO/PERDA BAIXADO → saiu de emUso via confirmarBaixa
            // - DANO/PERDA PENDENTE → AINDA em emUso (estoque não mudou)
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
            const emUso = item.quantidadePlanejada - totalSaiuDeEmUso;
            if (emUso > 0) {
              await this.stockService.liberarReserva(
                manager,
                item.equipmentId,
                emUso,
              );
            }

            // Cancelar ocorrências PENDENTES vinculadas a este item
            const pendentes = occurrences.filter(o => o.status === 'PENDENTE');
            for (const occ of pendentes) {
              occ.status = 'CANCELADO';
              await manager.save(EquipmentOccurrence, occ);
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
      
      // 🔴 CRITICAL RULE: Cancelled event = Finalized event
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

      return saved;
    });
  }

  /**
   * ARQUIVAR EVENTO: Soft-delete - oculta da listagem sem perder dados.
   */
  async arquivar(id: number, userId?: number, userEmail?: string) {
    const event = await this.repo.findOne({ where: { id } });
    if (!event) throw new BadRequestException('Evento não encontrado.');
    if (event.arquivado) throw new BadRequestException('Evento já está arquivado.');

    event.arquivado = true;
    event.arquivadoPor = userEmail ?? undefined;
    event.arquivadoEm = new Date();

    const saved = await this.repo.save(event);

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'ARQUIVAR',
      'event',
      id,
      { arquivado: true },
      `Evento "${event.nome}" arquivado`,
    );

    return saved;
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

  /**
   * CLONAR EVENTO: Clona o evento com toda a sua equipe e checklists vinculados.
   * Checklists clonados nascem com status 'rascunho' (sem reservar estoque).
   */
  async clonar(id: number, userId?: number, userEmail?: string) {
    const original = await this.repo.findOne({
      where: { id },
      relations: ['checklists', 'equipe'],
    });

    if (!original) throw new BadRequestException('Evento não encontrado.');

    // Cria cópia do evento
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

    // Clona equipe
    for (const m of original.equipe ?? []) {
      await this.teamRepo.save(
        this.teamRepo.create({
          nome: m.nome,
          funcao: m.funcao,
          event: eventoSalvo,
        }),
      );
    }

    // Validação de estoque para itens clonados
    const alertasEstoque: {
      equipmentId: number;
      nome: string;
      disponivel: number;
      solicitado: number;
      checklistNome: string;
    }[] = [];

    // Clona checklists vinculados (todos nascem rascunho, sem reservar estoque)
    for (const cl of original.checklists ?? []) {
      const novoCl = await this.checklistRepo.save(
        this.checklistRepo.create({
          nome: cl.nome,
          status: 'rascunho',
          eventId: eventoSalvo.id,
        }),
      );

      const items = await this.checklistItemRepo.find({
        where: { checklistId: cl.id },
      });

      for (const item of items) {
        // Busca equipamento atual para snapshot e validação de estoque
        const equipmentRepo =
          this.checklistItemRepo.manager.getRepository(Equipment);
        const equipment = await equipmentRepo.findOne({
          where: { id: item.equipmentId },
        });

        const nomeSnapshot = equipment?.nome ?? item.nomeSnapshot;
        const descricaoSnapshot =
          equipment?.descricao ?? item.descricaoSnapshot;

        // Verifica saldo disponível
        if (
          equipment &&
          item.quantidadePlanejada > equipment.quantidadeDisponivel
        ) {
          alertasEstoque.push({
            equipmentId: item.equipmentId,
            nome: nomeSnapshot,
            disponivel: equipment.quantidadeDisponivel,
            solicitado: item.quantidadePlanejada,
            checklistNome: cl.nome,
          });
        }

        await this.checklistItemRepo.save(
          this.checklistItemRepo.create({
            checklistId: novoCl.id,
            equipmentId: item.equipmentId,
            nomeSnapshot,
            descricaoSnapshot,
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
      { originalId: id, alertasEstoque: alertasEstoque.length },
      `Evento clonado de "${original.nome}" como "${eventoSalvo.nome}"${alertasEstoque.length > 0 ? ` (${alertasEstoque.length} item(ns) com estoque insuficiente)` : ''}`,
    );

    const evento = await this.repo.findOne({
      where: { id: eventoSalvo.id },
      relations: ['checklists', 'checklists.items', 'equipe'],
    });

    return { evento, alertasEstoque };
  }
}
