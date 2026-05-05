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

export type EventStatus = 'ativo' | 'finalizado' | 'cancelado';

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

  @OneToMany(() => Checklist, (checklist) => checklist.event)
  checklists: Checklist[];

  /** Accessor de compatibilidade — retorna o primeiro checklist */
  get checklist(): Checklist | undefined {
    return this.checklists?.[0];
  }

  @OneToMany(() => EventTeam, (team) => team.event, {
    cascade: true,
  })
  equipe: EventTeam[];

  @Column({ type: 'varchar', default: 'ativo' })
  status: EventStatus;

  @Column({ nullable: true })
  finalizadoPor?: string;

  @Column({ type: 'timestamp', nullable: true })
  finalizadoEm?: Date;

  @Column({ nullable: true })
  motivoCancelamento?: string;

  @Column({ nullable: true })
  canceladoPor?: string;

  @Column({ type: 'timestamp', nullable: true })
  canceladoEm?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: false })
  arquivado: boolean;

  @Column({ type: 'varchar', nullable: true })
  arquivadoPor?: string;

  @Column({ type: 'timestamp', nullable: true })
  arquivadoEm?: Date;

  /**
   * Indica que este evento já foi finalizado anteriormente.
   * Eventos com este flag, quando restaurados, só podem ser clonados.
   */
  @Column({ default: false })
  foiFinalizadoPreviamente: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
