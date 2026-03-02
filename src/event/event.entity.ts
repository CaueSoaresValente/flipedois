import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Checklist } from '../checklist/checklist.entity';
import { EventTeam } from './event-team.entity';

@Entity('event')
export class Event {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nome: string;

  @Column()
  cliente: string;

  @Column()
  local: string;

  @Column({ type: 'timestamp' })
  dataInicio: Date;

  @Column({ type: 'timestamp' })
  dataFim: Date;

  @Column({ nullable: true })
  observacoes: string;

  // Changed from OneToOne to OneToMany — an event can have multiple checklists
  @OneToMany(() => Checklist, (checklist) => checklist.event)
  checklists: Checklist[];

  // Legacy single checklist accessor (kept for backward compatibility)
  get checklist(): Checklist | undefined {
    return this.checklists?.[0];
  }

  @OneToMany(() => EventTeam, (team) => team.event, {
    cascade: true,
  })
  equipe: EventTeam[];

  @Column({ type: 'varchar', default: 'ativo' })
  status: 'ativo' | 'finalizado';

  @Column({ nullable: true })
  finalizadoPor?: string;

  @Column({ type: 'timestamp', nullable: true })
  finalizadoEm?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
