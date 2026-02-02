import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type ChecklistItemHistoryAction =
  | 'SEPARACAO'
  | 'DEVOLUCAO';

@Entity('checklist_item_history')
export class ChecklistItemHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  checklistItemId: number;

  @Column()
  acao: ChecklistItemHistoryAction;

  @Column()
  quantidadeAnterior: number;

  @Column()
  quantidadeNova: number;

  @Column()
  usuario: string;

  @CreateDateColumn()
  createdAt: Date;
}
