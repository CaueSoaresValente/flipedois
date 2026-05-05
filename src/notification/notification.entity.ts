import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type NotificationType =
  | 'EQUIPAMENTO_REMOVIDO'
  | 'QUANTIDADE_AUMENTADA'
  | 'QUANTIDADE_DIMINUIDA'
  | 'EQUIPAMENTO_ADICIONADO'
  | 'EVENTO_LIBERADO'
  | 'EVENTO_CANCELADO'
  | 'EVENTO_FINALIZADO'
  | 'CHECKLIST_LIBERADO'
  | 'CHECKLIST_CANCELADO';

@Entity('notification')
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  /** ID do usuário destinatário (FUNCIONARIO) */
  @Column()
  userId: number;

  @Column({ type: 'varchar' })
  tipo: NotificationType;

  @Column({ type: 'text' })
  mensagem: string;

  @Column({ nullable: true })
  checklistId?: number;

  @Column({ nullable: true })
  checklistNome?: string;

  @Column({ nullable: true })
  equipmentNome?: string;

  @Column({ nullable: true })
  quantidadeAnterior?: number;

  @Column({ nullable: true })
  quantidadeNova?: number;

  @Column({ default: false })
  lida: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
