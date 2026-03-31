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

  @Column({ default: 0 })
  quantidadeDisponivel: number;

  /**
   * Quantidade atualmente em uso (reservada para eventos liberados).
   * Fórmula: total = disponivel + emUso + danificado + perdido
   */
  @Column({ default: 0 })
  quantidadeEmUso: number;

  /**
   * Quantidade confirmada como danificada (ocorrência BAIXADA tipo DANO).
   */
  @Column({ default: 0 })
  quantidadeDanificada: number;

  /**
   * Quantidade confirmada como perdida (ocorrência BAIXADA tipo PERDA).
   */
  @Column({ default: 0 })
  quantidadePerdida: number;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: 'interno' })
  origem: EquipmentOrigem;

  @Column({ default: 'som' })
  setor: 'som' | 'luz' | 'video' | 'estrutura';

  @Column({ nullable: true })
  fornecedor?: string;

  @VersionColumn()
  version: number;
}
