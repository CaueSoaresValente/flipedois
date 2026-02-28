import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  VersionColumn,
} from 'typeorm';
import { ChecklistItem } from '../checklist-item/checklist-item.entity';
import { Event } from '../event/event.entity';

/**
 * 🔒 STATUS OFICIAL DO CHECKLIST
 * Nunca use status fora dessa lista
 */
export type ChecklistStatus =
  | 'rascunho' // criado, editável
  | 'liberado' // pronto para separação
  | 'em_evento' // tudo separado, aguardando devolução
  | 'pendente_devolucao' // devolução parcial (faltando itens)
  | 'concluido'
  | 'cancelado';

@Entity('checklist')
export class Checklist {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  motivoCancelamento?: string;

  @Column({ nullable: true })
  canceladoPor?: string;

  @Column({ nullable: true })
  canceladoEm?: Date;

  @Column()
  nome: string;

  @Column({ type: 'varchar', default: 'rascunho' })
  status: ChecklistStatus;

  @Column({ nullable: true })
  eventId?: number;

  @ManyToOne(() => Event, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'eventId' })
  event?: Event;

  @OneToMany(() => ChecklistItem, (item) => item.checklist)
  items: ChecklistItem[];

  @CreateDateColumn()
  createdAt: Date;

  @VersionColumn()
  version: number;
}
