import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  VersionColumn,
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

  @VersionColumn()
  version: number;
}
