import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Checklist } from './checklist.entity';
import { ChecklistItem } from '../checklist-item/checklist-item.entity';
import { Equipment } from '../equipment/equipment.entity';
import { Event } from '../event/event.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { StockService } from '../stock/stock.service';

@Injectable()
export class ChecklistService {
  constructor(
    @InjectRepository(Checklist)
    private readonly checklistRepository: Repository<Checklist>,

    @InjectRepository(ChecklistItem)
    private readonly checklistItemRepository: Repository<ChecklistItem>,

    @InjectRepository(Equipment)
    private readonly equipmentRepository: Repository<Equipment>,

    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,

    private readonly dataSource: DataSource,
    private readonly auditLogService: AuditLogService,
    private readonly stockService: StockService,
  ) {}

  async create(
    nome: string,
    eventId: number,
    userId?: number,
    userEmail?: string,
  ) {
    if (!nome || nome.trim().length === 0) {
      throw new BadRequestException('Nome do checklist é obrigatório.');
    }

    if (!eventId) {
      throw new BadRequestException(
        'Checklist precisa estar vinculado a um evento.',
      );
    }

    const event = await this.eventRepository.findOne({
      where: { id: eventId },
    });
    if (!event) {
      throw new BadRequestException('Evento não encontrado.');
    }

    if (event.status === 'finalizado') {
      throw new BadRequestException(
        'Não é possível criar checklist para evento finalizado.',
      );
    }

    if (event.status === 'cancelado') {
      throw new BadRequestException(
        'Não é possível criar checklist para evento cancelado.',
      );
    }

    const checklist = this.checklistRepository.create({
      nome,
      status: 'rascunho',
      eventId,
    });

    const saved = await this.checklistRepository.save(checklist);

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'CREATE',
      'checklist',
      saved.id,
      { nome, eventId },
      `Checklist "${nome}" criado para evento "${event.nome}"`,
    );

    return saved;
  }

  async findAll(userRole?: string) {
    const query = this.checklistRepository
      .createQueryBuilder('checklist')
      .leftJoinAndSelect('checklist.items', 'items')
      .leftJoinAndSelect('checklist.event', 'event')
      .orderBy('checklist.createdAt', 'DESC');

    // FUNCIONÁRIO só vê checklists liberados e além
    if (userRole === 'FUNCIONARIO') {
      query.where('checklist.status IN (:...statuses)', {
        statuses: ['liberado', 'em_evento', 'pendente_devolucao', 'concluido'],
      });
    }

    return query.getMany();
  }

  async findOne(id: number) {
    const checklist = await this.checklistRepository.findOne({
      where: { id },
      relations: ['items', 'event'],
    });

    if (!checklist) {
      throw new BadRequestException('Checklist não encontrado.');
    }

    return checklist;
  }

  /**
   * LIBERAR: Valida estoque e reserva as quantidades planejadas.
   * Usa transação com lock para garantir atomicidade.
   *
   * Fluxo de estoque na liberação:
   *   disponivel -= quantidadePlanejada
   *   emUso += quantidadePlanejada
   */
  async liberar(id: number, userId?: number, userEmail?: string) {
    return this.dataSource.transaction(async (manager) => {
      const checklist = await manager.findOne(Checklist, {
        where: { id },
        relations: ['items'],
      });

      if (!checklist) {
        throw new BadRequestException('Checklist não encontrado.');
      }

      if (checklist.status !== 'rascunho') {
        throw new BadRequestException(
          `Checklist não pode ser liberado. Status atual: "${checklist.status}". Apenas rascunhos podem ser liberados.`,
        );
      }

      // Verifica se algum item foi adicionado
      const itemCount = checklist.items?.length ?? 0;

      if (!checklist.eventId) {
        throw new BadRequestException(
          'Checklist precisa estar vinculado a um evento para ser liberado.',
        );
      }

      if (itemCount === 0) {
        throw new BadRequestException(
          'Checklist precisa ter ao menos um item para ser liberado.',
        );
      }

      // Agrupa quantidades por equipamento
      const mapa = new Map<number, number>();
      for (const item of checklist.items) {
        const atual = mapa.get(item.equipmentId) ?? 0;
        mapa.set(item.equipmentId, atual + item.quantidadePlanejada);
      }

      // Reserva estoque via StockService (verifica disponibilidade internamente)
      for (const [equipmentId, quantidade] of mapa.entries()) {
        await this.stockService.reservarEstoque(
          manager,
          equipmentId,
          quantidade,
        );
      }

      checklist.status = 'liberado';
      const saved = await manager.save(Checklist, checklist);

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'LIBERAR',
        'checklist',
        id,
        { status: 'rascunho → liberado' },
        `Checklist "${checklist.nome}" liberado para separação (estoque reservado)`,
      );

      return saved;
    });
  }

  /**
   * ATUALIZAR NOME: Permite renomear checklist em qualquer status não terminal.
   */
  async updateNome(
    id: number,
    nome: string,
    userId?: number,
    userEmail?: string,
  ) {
    if (!nome || nome.trim().length === 0) {
      throw new BadRequestException('Nome não pode ser vazio.');
    }

    const checklist = await this.checklistRepository.findOne({ where: { id } });
    if (!checklist) {
      throw new BadRequestException('Checklist não encontrado.');
    }

    if (['concluido', 'cancelado'].includes(checklist.status)) {
      throw new BadRequestException(
        'Não é possível renomear checklist concluído ou cancelado.',
      );
    }

    const nomeAnterior = checklist.nome;
    checklist.nome = nome.trim();
    const saved = await this.checklistRepository.save(checklist);

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'UPDATE',
      'checklist',
      id,
      { nomeAnterior, nomeNovo: nome },
      `Checklist renomeado: "${nomeAnterior}" → "${nome}"`,
    );

    return saved;
  }

  async vincularEvento(
    checklistId: number,
    eventId: number,
    userId?: number,
    userEmail?: string,
  ) {
    const checklist = await this.checklistRepository.findOne({
      where: { id: checklistId },
    });

    if (!checklist) {
      throw new BadRequestException('Checklist não encontrado.');
    }

    if (checklist.status !== 'rascunho') {
      throw new BadRequestException(
        'Só é possível vincular evento em checklist rascunho.',
      );
    }

    const event = await this.eventRepository.findOne({
      where: { id: eventId },
    });
    if (!event) {
      throw new BadRequestException('Evento não encontrado.');
    }

    checklist.eventId = eventId;
    const saved = await this.checklistRepository.save(checklist);

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'UPDATE',
      'checklist',
      checklistId,
      { eventId },
      `Checklist vinculado ao evento "${event.nome}"`,
    );

    return saved;
  }

  async clonar(
    checklistId: number,
    nomeNovo?: string,
    userId?: number,
    userEmail?: string,
  ) {
    const checklistOriginal = await this.checklistRepository.findOne({
      where: { id: checklistId },
      relations: ['items'],
    });

    if (!checklistOriginal) {
      throw new BadRequestException('Checklist não encontrado.');
    }

    const nomeFinal = nomeNovo?.trim() || `${checklistOriginal.nome} (cópia)`;

    // Clone permite qualquer status não-terminal
    if (['cancelado', 'concluido'].includes(checklistOriginal.status)) {
      // Ainda permitimos clonar cancelados e concluídos
    }

    const novoChecklist = this.checklistRepository.create({
      nome: nomeFinal,
      status: 'rascunho',
      // Cópia NÃO herda o evento — admin vincula manualmente
    });

    const checklistSalvo = await this.checklistRepository.save(novoChecklist);

    const alertas: string[] = [];
    const itensEstoqueInsuficiente: { equipmentId: number; nome: string }[] = [];

    for (const item of checklistOriginal.items) {
      const equipment = await this.equipmentRepository.findOne({
        where: { id: item.equipmentId },
      });

      if (!equipment) {
        alertas.push(`Equipamento "${item.nomeSnapshot}" não existe mais.`);
        continue;
      }

      if (item.quantidadePlanejada > equipment.quantidadeDisponivel) {
        alertas.push(
          `${equipment.nome}: estoque atual ${equipment.quantidadeDisponivel}, solicitado ${item.quantidadePlanejada}`,
        );
        itensEstoqueInsuficiente.push({
          equipmentId: equipment.id,
          nome: equipment.nome,
        });
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
        setor: item.setor,
      });

      await this.checklistItemRepository.save(novoItem);
    }

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'CLONAR',
      'checklist',
      checklistSalvo.id,
      { originalId: checklistId },
      `Checklist clonado de "${checklistOriginal.nome}" como "${nomeFinal}"`,
    );

    return {
      checklist: checklistSalvo,
      alertas,
      itensEstoqueInsuficiente,
    };
  }

  /**
   * CANCELAR: Reverte reservas de estoque e cancela o checklist.
   *
   * Para checklist liberado: reverte quantidades planejadas (reservadas em estoque)
   * Para checklist em_evento: reverte separações existentes
   * Para rascunho: sem impacto no estoque
   */
  async cancelar(id: number, motivo: string, usuario: string, userId?: number) {
    return this.dataSource.transaction(async (manager) => {
      const checklist = await manager.findOne(Checklist, {
        where: { id },
        relations: ['items'],
      });

      if (!checklist) {
        throw new BadRequestException('Checklist não encontrado.');
      }

      if (['concluido', 'cancelado'].includes(checklist.status)) {
        throw new BadRequestException(
          `Não é possível cancelar checklist com status "${checklist.status}".`,
        );
      }

      // NOTA DE ESTOQUE:
      // Na liberação: disponivel -= planejado, emUso += planejado
      // Na devolução OK: disponivel += ok, emUso -= ok
      // Na devolução quebrado/perdido: emUso -= qty (imediato)
      //
      // Portanto, emUso restante = planejado - totalDevolvido
      // onde totalDevolvido = ok + quebrado + perdido

      // Reverte reservas de estoque conforme status
      if (checklist.items) {
        for (const item of checklist.items) {
          if (checklist.status === 'liberado') {
            // Cheklist liberado: nada foi separado/devolvido ainda
            // emUso contém toda a quantidade planejada
            await this.stockService.liberarReserva(
              manager,
              item.equipmentId,
              item.quantidadePlanejada,
            );
          } else if (
            ['em_evento', 'pendente_devolucao'].includes(checklist.status)
          ) {
            // Calcula o que ainda está em emUso:
            // planejado - (ok + quebrado + perdido) = não devolvido
            // ok -> já retornou para disponivel
            // quebrado/perdido -> já saíram do emUso E do total na devolução
            // Então emUso restante = planejado - totalDevolvido
            const totalDevolvido =
              (item.quantidadeOk || 0) +
              (item.quantidadeQuebrada || 0) +
              (item.quantidadePerdida || 0);
            const emUsoRestante = item.quantidadePlanejada - totalDevolvido;
            if (emUsoRestante > 0) {
              await this.stockService.liberarReserva(
                manager,
                item.equipmentId,
                emUsoRestante,
              );
            }
          }
        }
      }

      checklist.status = 'cancelado';
      checklist.motivoCancelamento = motivo;
      checklist.canceladoPor = usuario;
      checklist.canceladoEm = new Date();

      const saved = await manager.save(Checklist, checklist);

      await this.auditLogService.log(
        userId ?? null,
        usuario,
        'CANCELAR',
        'checklist',
        id,
        { motivo, status: 'cancelado' },
        `Checklist "${checklist.nome}" cancelado: ${motivo}`,
      );

      return saved;
    });
  }

  async obterAlertas(checklistId: number) {
    const checklist = await this.checklistRepository.findOne({
      where: { id: checklistId },
      relations: ['items'],
    });

    if (!checklist) throw new BadRequestException('Checklist não encontrado.');

    let pendentesSeparacao = 0;
    let pendentesDevolucao = 0;

    for (const item of checklist.items) {
      if (item.quantidadeSeparada < item.quantidadePlanejada) {
        pendentesSeparacao++;
      }

      if (
        item.quantidadeSeparada > 0 &&
        item.quantidadeDevolvida < item.quantidadeSeparada
      ) {
        pendentesDevolucao++;
      }
    }

    const alertas: string[] = [];

    if (pendentesSeparacao > 0) {
      alertas.push(`${pendentesSeparacao} item(ns) pendentes de separação`);
    }

    if (pendentesDevolucao > 0) {
      alertas.push(`${pendentesDevolucao} item(ns) pendentes de devolução`);
    }

    if (alertas.length === 0) {
      alertas.push('Checklist totalmente regular');
    }

    return {
      checklistId,
      status: checklist.status,
      alertas,
    };
  }

  /**
   * REATIVAR: Restaura um checklist cancelado de volta para rascunho.
   * Sem impacto no estoque (estoque já foi liberado no cancelamento).
   * Evento deve estar ativo.
   */
  async reativar(id: number, userId?: number, userEmail?: string) {
    const checklist = await this.checklistRepository.findOne({
      where: { id },
      relations: ['event'],
    });

    if (!checklist) {
      throw new BadRequestException('Checklist não encontrado.');
    }

    if (checklist.status !== 'cancelado') {
      throw new BadRequestException(
        `Somente checklists cancelados podem ser reativados. Status atual: "${checklist.status}".`,
      );
    }

    if (checklist.event) {
      if (checklist.event.status === 'finalizado') {
        throw new BadRequestException(
          'Não é possível reativar checklist de evento finalizado.',
        );
      }
      if (checklist.event.status === 'cancelado') {
        throw new BadRequestException(
          'Não é possível reativar checklist de evento cancelado.',
        );
      }
    }

    checklist.status = 'rascunho';
    checklist.motivoCancelamento = undefined;
    checklist.canceladoPor = undefined;
    checklist.canceladoEm = undefined;

    const saved = await this.checklistRepository.save(checklist);

    await this.auditLogService.log(
      userId ?? null,
      userEmail ?? null,
      'REATIVAR',
      'checklist',
      id,
      { status: 'cancelado → rascunho' },
      `Checklist "${checklist.nome}" reativado`,
    );

    return saved;
  }
}
