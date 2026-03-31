import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Event } from '../event/event.entity';
import { Equipment } from '../equipment/equipment.entity';

export type OccurrenceStatus = 'PENDENTE' | 'BAIXADO' | 'CANCELADO' | 'RESOLVIDO';
export type OccurrenceTipo = 'OK' | 'DANO' | 'PERDA';

@Entity('equipment_occurrence')
export class EquipmentOccurrence {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Event, { eager: true, nullable: true })
  event: Event | null;

  @ManyToOne(() => Equipment, { eager: true })
  equipment: Equipment;

  @Column()
  quantidade: number;

  @Column({ nullable: true })
  descricao: string;

  @Column({
    type: 'varchar',
    default: 'PENDENTE',
  })
  status: OccurrenceStatus;

  @Column({
    type: 'varchar',
    default: 'DANO',
  })
  tipo: OccurrenceTipo;

  @Column({ nullable: true })
  motivo?: string;

@Column({ type: 'int', nullable: true })
checklistItemId: number | null;

  @Column({ type: 'boolean', default: false })
  manual: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
