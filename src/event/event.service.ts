import { Event } from './event.entity';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Checklist } from '../checklist/checklist.entity';
import { ChecklistItem } from '../checklist-item/checklist-item.entity';
import { DataSource, Repository } from 'typeorm';
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

    if (dto.checklistId) {
      const checklist = await this.checklistRepo.findOne({
        where: { id: dto.checklistId },
      });
      if (checklist) {
        checklist.eventId = saved.id;
        await this.checklistRepo.save(checklist);
      }
    }

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

  findAll() {
    return this.repo.find({
      relations: ['checklists', 'equipe'],
      order: { dataInicio: 'DESC' },
    });
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

    const membro = this.teamRepo.create({ nome: dto.nome, funcao: dto.funcao, event });
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
    if (event.status === 'finalizado') throw new BadRequestException('Evento já está finalizado.');
    if (event.status === 'cancelado') throw new BadRequestException('Evento cancelado não pode ser finalizado.');

    const checklistsAtivos = (event.checklists ?? []).filter(
      (cl) => !['concluido', 'cancelado'].includes(cl.status),
    );

    if (checklistsAtivos.length > 0) {
      const nomes = checklistsAtivos.map((cl) => `"${cl.nome}" (${cl.status})`).join(', ');
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
  async cancelar(id: number, motivo: string, userId?: number, userEmail?: string) {
    if (!motivo || motivo.trim().length === 0) {
      throw new BadRequestException('Motivo do cancelamento é obrigatório.');
    }

    return this.dataSource.transaction(async (manager) => {
      const event = await manager.findOne(Event, {
        where: { id },
        relations: ['checklists', 'checklists.items'],
      });

      if (!event) throw new BadRequestException('Evento não encontrado.');

      if (event.status === 'cancelado') throw new BadRequestException('Evento já está cancelado.');
      if (event.status === 'finalizado') throw new BadRequestException('Não é possível cancelar evento finalizado.');

      // Reverte reservas de estoque para checklists ativos
      for (const checklist of event.checklists ?? []) {
        if (['cancelado', 'concluido'].includes(checklist.status)) continue;

        const items = await manager.find(ChecklistItem, {
          where: { checklistId: checklist.id },
        });

        for (const item of items) {
          if (checklist.status === 'liberado') {
            // Stock foi reservado na liberação — reverter tudo
            await this.stockService.liberarReserva(manager, item.equipmentId, item.quantidadePlanejada);
          } else if (['em_evento', 'pendente_devolucao'].includes(checklist.status)) {
            // Reverter apenas o que ainda está em emUso (separado - devolvido ok)
            const emUso = item.quantidadeSeparada - (item.quantidadeOk || 0);
            if (emUso > 0) {
              await this.stockService.liberarReserva(manager, item.equipmentId, emUso);
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

  async update(id: number, dto: Partial<CreateEventDto>, userId?: number, userEmail?: string) {
    const event = await this.repo.findOne({ where: { id } });

    if (!event) throw new BadRequestException('Evento não encontrado.');
    if (event.status === 'finalizado') throw new BadRequestException('Não é possível editar evento finalizado.');
    if (event.status === 'cancelado') throw new BadRequestException('Não é possível editar evento cancelado.');

    if (dto.dataInicio !== undefined || dto.dataFim !== undefined) {
      const inicio = dto.dataInicio ?? event.dataInicio.toISOString();
      const fim = dto.dataFim ?? event.dataFim.toISOString();
      this.validarDatas(inicio, fim);
    }

    if (dto.nome !== undefined) event.nome = dto.nome;
    if (dto.cliente !== undefined) event.cliente = dto.cliente;
    if (dto.local !== undefined) event.local = dto.local;
    if (dto.dataInicio !== undefined) event.dataInicio = new Date(dto.dataInicio);
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
}
