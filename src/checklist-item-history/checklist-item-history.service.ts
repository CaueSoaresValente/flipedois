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
  ) {
    return this.repository.save({
      checklistItemId,
      acao: 'SEPARACAO',
      quantidadeAnterior,
      quantidadeNova,
      usuario: 'funcionario',
    });
  }

  async registrarDevolucao(
    checklistItemId: number,
    quantidadeAnterior: number,
    quantidadeNova: number,
  ) {
    return this.repository.save({
      checklistItemId,
      acao: 'DEVOLUCAO',
      quantidadeAnterior,
      quantidadeNova,
      usuario: 'funcionario',
    });
  }

  async findByChecklistItem(checklistItemId: number) {
    return this.repository.find({
      where: { checklistItemId },
      order: { createdAt: 'ASC' },
    });
  }
}
