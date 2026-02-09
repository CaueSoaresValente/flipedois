import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
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

  @OneToOne(() => Checklist)
  @JoinColumn()
  checklist: Checklist;

  @OneToMany(() => EventTeam, team => team.event, {
    cascade: true,
  })
  equipe: EventTeam[];

  @CreateDateColumn()
  createdAt: Date;
}
