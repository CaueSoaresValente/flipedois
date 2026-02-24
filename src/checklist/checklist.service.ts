import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Checklist } from './checklist.entity';
import { ChecklistItem } from '../checklist-item/checklist-item.entity';
import { Equipment } from '../equipment/equipment.entity';

@Injectable()
export class ChecklistService {
  constructor(
    @InjectRepository(Checklist)
    private readonly checklistRepository: Repository<Checklist>,

    @InjectRepository(ChecklistItem)
    private readonly checklistItemRepository: Repository<ChecklistItem>,

    @InjectRepository(Equipment)
    private readonly equipmentRepository: Repository<Equipment>,
  ) {}

  async create(nome: string) {
    if (!nome || nome.trim().length === 0) {
      throw new BadRequestException('Nome do checklist é obrigatório');
    }

    const checklist = this.checklistRepository.create({
      nome,
      status: 'rascunho',
    });

    return this.checklistRepository.save(checklist);
  }

  async findAll() {
    return this.checklistRepository.find({
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number) {
    const checklist = await this.checklistRepository.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!checklist) {
      throw new BadRequestException('Checklist não encontrado');
    }

    return checklist;
  }

  /**
   * LIBERAR: apenas valida estoque e muda status.
   * A baixa de estoque real acontece na SEPARAÇÃO (checklist-item.service).
   */
  async liberar(id: number) {
    const checklist = await this.checklistRepository.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!checklist) {
      throw new BadRequestException('Checklist não encontrado');
    }

    if (checklist.status !== 'rascunho') {
      throw new BadRequestException('Checklist não pode ser liberado');
    }

    if (!checklist.items || checklist.items.length === 0) {
      throw new BadRequestException(
        'Checklist precisa ter ao menos um item para ser liberado',
      );
    }

    // Agrupa quantidade por equipamento para validação
    const mapa = new Map<number, number>();

    for (const item of checklist.items) {
      const atual = mapa.get(item.equipmentId) ?? 0;
      mapa.set(item.equipmentId, atual + item.quantidadePlanejada);
    }

    // Valida se há estoque suficiente (apenas validação, sem baixa)
    for (const [equipmentId, quantidade] of mapa.entries()) {
      const equipment = await this.equipmentRepository.findOne({
        where: { id: equipmentId },
      });

      if (!equipment) {
        throw new BadRequestException('Equipamento não encontrado');
      }

      if (
        equipment.origem === 'interno' &&
        quantidade > equipment.quantidadeDisponivel
      ) {
        throw new BadRequestException(
          `Estoque insuficiente para ${equipment.nome}. Disponível: ${equipment.quantidadeDisponivel}`,
        );
      }
    }

    // Apenas muda o status — estoque é deduzido na separação
    checklist.status = 'liberado';
    return this.checklistRepository.save(checklist);
  }

  async clonar(checklistId: number) {
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

    return {
      checklist: checklistSalvo,
      alertas,
    };
  }

  async cancelar(id: number, motivo: string, usuario: string) {
    const checklist = await this.checklistRepository.findOne({
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

    // Devolve estoque se já houve separação
    if (checklist.status === 'liberado' && checklist.items) {
      for (const item of checklist.items) {
        if (item.quantidadeSeparada > 0) {
          const equipment = await this.equipmentRepository.findOne({
            where: { id: item.equipmentId },
          });

          if (equipment && equipment.origem === 'interno') {
            equipment.quantidadeDisponivel += item.quantidadeSeparada;
            await this.equipmentRepository.save(equipment);
          }
        }
      }
    }

    checklist.status = 'cancelado';
    checklist.motivoCancelamento = motivo;
    checklist.canceladoPor = usuario;
    checklist.canceladoEm = new Date();

    return this.checklistRepository.save(checklist);
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
