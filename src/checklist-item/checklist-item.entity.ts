import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
  VersionColumn,
} from 'typeorm';
import { Checklist } from '../checklist/checklist.entity';

export type StatusDevolucao =
  | 'pendente'
  | 'faltando'
  | 'devolvido'
  | 'quebrado'
  | 'perdido'
  | 'pendente_revisao'
  | 'aguardando_confirmacao';

@Index(['checklistId', 'equipmentId'], { unique: true })
@Entity('checklist_item')
export class ChecklistItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Checklist, (checklist) => checklist.items, {
    onDelete: 'CASCADE',
  })
  checklist: Checklist;

  @Column()
  checklistId: number;

  @Column()
  equipmentId: number;

  @Column()
  nomeSnapshot: string;

  @Column()
  descricaoSnapshot: string;

  @Column()
  quantidadePlanejada: number;

  @Column({ default: 0 })
  quantidadeSeparada: number;

  @Column({ default: 'pendente' })
  statusSeparacao: 'pendente' | 'separado';

  @Column({ default: 0 })
  quantidadeDevolvida: number;

  @Column({ default: 0 })
  quantidadeDevolvidaOriginal: number;

  @Column({ default: 0 })
  quantidadeOk: number;

  @Column({ default: 0 })
  quantidadeQuebrada: number;

  @Column({ default: 0 })
  quantidadePerdida: number;

  @Column({ default: 'pendente' })
  statusDevolucao: StatusDevolucao;

  @Column({ nullable: true })
  observacaoDevolucao?: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({
    type: 'varchar',
    default: 'som',
  })
  setor: 'som' | 'luz' | 'video' | 'estrutura';

  @VersionColumn()
  version: number;
}
