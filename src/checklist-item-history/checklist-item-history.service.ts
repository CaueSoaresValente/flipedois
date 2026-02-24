import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChecklistItemHistory } from './checklist-item-history.entity';

@Injectable()
export class ChecklistItemHistoryService {
  constructor(
    @InjectRepository(ChecklistItemHistory)
    private readonly repository: Repository<ChecklistItemHistory>,
  ) {}

  async registrarSeparacao(
    checklistItemId: number,
    quantidadeAnterior: number,
    quantidadeNova: number,
    usuario = 'sistema',
  ) {
    return this.repository.save({
      checklistItemId,
      acao: 'SEPARACAO',
      quantidadeAnterior,
      quantidadeNova,
      usuario,
    });
  }

  async registrarDevolucao(
    checklistItemId: number,
    quantidadeAnterior: number,
    quantidadeNova: number,
    usuario = 'sistema',
  ) {
    return this.repository.save({
      checklistItemId,
      acao: 'DEVOLUCAO',
      quantidadeAnterior,
      quantidadeNova,
      usuario,
    });
  }

  async findByChecklistItem(checklistItemId: number) {
    return this.repository.find({
      where: { checklistItemId },
      order: { createdAt: 'ASC' },
    });
  }

  async findAll() {
    return this.repository.find({
      order: { createdAt: 'DESC' },
    });
  }
}
