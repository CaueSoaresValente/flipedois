import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Checklist } from './checklist.entity';
import { ChecklistItem } from '../checklist-item/checklist-item.entity';
import { Equipment } from '../equipment/equipment.entity';
import { Event } from '../event/event.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

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
  ) { }

  async create(nome: string, eventId: number, userId?: number, userEmail?: string) {
    if (!nome || nome.trim().length === 0) {
      throw new BadRequestException('Nome do checklist é obrigatório');
    }

    if (!eventId) {
      throw new BadRequestException('Checklist precisa estar vinculado a um evento');
    }

    const event = await this.eventRepository.findOne({ where: { id: eventId } });
    if (!event) {
      throw new BadRequestException('Evento não encontrado');
    }

    if (event.status === 'finalizado') {
      throw new BadRequestException('Não é possível criar checklist para evento finalizado');
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

    // FUNCIONÁRIO only sees released and beyond checklists
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
      throw new BadRequestException('Checklist não encontrado');
    }

    return checklist;
  }

  /**
   * LIBERAR: validates event, stock, and changes status.
   * Uses a database transaction for atomicity.
   */
  async liberar(id: number, userId?: number, userEmail?: string) {
    return this.dataSource.transaction(async (manager) => {
      const checklist = await manager.findOne(Checklist, {
        where: { id },
        relations: ['items'],
      });

      if (!checklist) {
        throw new BadRequestException('Checklist não encontrado');
      }

      if (checklist.status !== 'rascunho') {
        throw new BadRequestException('Checklist não pode ser liberado. Status atual: ' + checklist.status);
      }

      // Fix #14: Validate that checklist has an event linked
      if (!checklist.eventId) {
        throw new BadRequestException(
          'Checklist precisa estar vinculado a um evento para ser liberado',
        );
      }

      if (!checklist.items || checklist.items.length === 0) {
        throw new BadRequestException(
          'Checklist precisa ter ao menos um item para ser liberado',
        );
      }

      // Group quantities by equipment for validation
      const mapa = new Map<number, number>();

      for (const item of checklist.items) {
        const atual = mapa.get(item.equipmentId) ?? 0;
        mapa.set(item.equipmentId, atual + item.quantidadePlanejada);
      }

      // Validate stock (no deduction — that happens during separation)
      for (const [equipmentId, quantidade] of mapa.entries()) {
        const equipment = await manager.findOne(Equipment, {
          where: { id: equipmentId },
        });

        if (!equipment) {
          throw new BadRequestException(`Equipamento ID ${equipmentId} não encontrado`);
        }

        if (
          equipment.origem === 'interno' &&
          quantidade > equipment.quantidadeDisponivel
        ) {
          throw new BadRequestException(
            `Estoque insuficiente para "${equipment.nome}". Disponível: ${equipment.quantidadeDisponivel}, Solicitado: ${quantidade}`,
          );
        }
      }

      checklist.status = 'liberado';
      const saved = await manager.save(Checklist, checklist);

      await this.auditLogService.log(
        userId ?? null,
        userEmail ?? null,
        'LIBERAR',
        'checklist',
        id,
        { status: 'rascunho -> liberado' },
        `Checklist "${checklist.nome}" liberado para separação`,
      );

      return saved;
    });
  }

  async vincularEvento(checklistId: number, eventId: number, userId?: number, userEmail?: string) {
    const checklist = await this.checklistRepository.findOne({
      where: { id: checklistId },
    });

    if (!checklist) {
      throw new BadRequestException('Checklist não encontrado');
    }

    if (checklist.status !== 'rascunho') {
      throw new BadRequestException('Só é possível vincular evento em checklist rascunho');
    }

    const event = await this.eventRepository.findOne({ where: { id: eventId } });
    if (!event) {
      throw new BadRequestException('Evento não encontrado');
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

  async clonar(checklistId: number, userId?: number, userEmail?: string) {
    const checklistOriginal = await this.checklistRepository.findOne({
      where: { id: checklistId },
      relations: ['items'],
    });

    if (!checklistOriginal) {
      throw new BadRequestException('Checklist não encontrado');
    }

    const novoChecklist = this.checklistRepository.create({
      nome: `${checklistOriginal.nome} (cópia)`,
      status: 'rascunho',
    });

    const checklistSalvo =
      await this.checklistRepository.save(novoChecklist);

    const alertas: string[] = [];

    for (const item of checklistOriginal.items) {
      const equipment = await this.equipmentRepository.findOne({
        where: { id: item.equipmentId },
      });

      if (!equipment) {
        alertas.push(`Equipamento "${item.nomeSnapshot}" não existe mais`);
        continue;
      }

      if (item.quantidadePlanejada > equipment.quantidadeDisponivel) {
        alertas.push(
          `${equipment.nome}: estoque atual ${equipment.quantidadeDisponivel}, solicitado ${item.quantidadePlanejada}`,
        );
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
      `Checklist clonado de "${checklistOriginal.nome}"`,
    );

    return {
      checklist: checklistSalvo,
      alertas,
    };
  }

  async cancelar(id: number, motivo: string, usuario: string, userId?: number) {
    return this.dataSource.transaction(async (manager) => {
      const checklist = await manager.findOne(Checklist, {
        where: { id },
        relations: ['items'],
      });

      if (!checklist) {
        throw new BadRequestException('Checklist não encontrado');
      }

      if (checklist.status === 'em_evento') {
        throw new BadRequestException(
          'Não é possível cancelar checklist em evento',
        );
      }

      if (
        checklist.status !== 'liberado' &&
        checklist.status !== 'rascunho'
      ) {
        throw new BadRequestException(
          'Só é possível cancelar checklists em rascunho ou liberados',
        );
      }

      // Return stock if separation has occurred
      if (checklist.status === 'liberado' && checklist.items) {
        for (const item of checklist.items) {
          if (item.quantidadeSeparada > 0) {
            const equipment = await manager.findOne(Equipment, {
              where: { id: item.equipmentId },
            });

            if (equipment && equipment.origem === 'interno') {
              equipment.quantidadeDisponivel += item.quantidadeSeparada;
              await manager.save(Equipment, equipment);
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

    if (!checklist)
      throw new BadRequestException('Checklist não encontrado');

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
      alertas.push(
        `${pendentesDevolucao} item(ns) pendentes de devolução`,
      );
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
}
