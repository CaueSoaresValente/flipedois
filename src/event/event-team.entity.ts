import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Event } from './event.entity';

export type TeamRole = 'montagem' | 'operacao' | 'desmontagem';

@Entity('event_team')
export class EventTeam {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nome: string;

  @Column()
  funcao: TeamRole;

  @ManyToOne(() => Event, (event) => event.equipe, {
    onDelete: 'CASCADE',
  })
  event: Event;
}
