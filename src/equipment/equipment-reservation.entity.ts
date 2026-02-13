import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('equipment_reservation')
export class EquipmentReservation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  equipmentId: number;

  @Column()
  checklistId: number;

  @Column()
  quantidade: number;

  @Column({ type: 'timestamp' })
  dataInicio: Date;

  @Column({ type: 'timestamp' })
  dataFim: Date;
}
