import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type EquipmentOrigem = 'interno' | 'alugado';

@Entity('equipment')
export class Equipment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nome: string;

  @Column()
  descricao: string;

  @Column()
  quantidadeTotal: number;

  @Column()
  quantidadeDisponivel: number;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: 'interno' })
  origem: EquipmentOrigem;

  @Column({ nullable: true })
  fornecedor?: string;
}
