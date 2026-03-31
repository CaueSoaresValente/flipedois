import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LIBERAR'
  | 'CANCELAR'
  | 'SEPARAR'
  | 'DEVOLVER'
  | 'CANCELAR_SEPARACAO'
  | 'CLONAR'
  | 'DESATIVAR'
  | 'FINALIZAR'
  | 'REATIVAR'
  | 'OCORRENCIA_REGISTRAR'
  | 'OCORRENCIA_CONFIRMAR'
  | 'OCORRENCIA_CANCELAR'
  | 'OCORRENCIA_AUTO'
  | 'EDITAR_DEVOLUCAO'
  | 'REVISAR_DEVOLUCAO'
  | 'APROVAR_LOTE'
  | 'REVISAR_LOTE'
  | 'APROVAR_TUDO'
  | 'ARQUIVAR';

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  userId: number;

  @Column({ nullable: true })
  userEmail: string;

  @Column()
  action: AuditAction;

  @Column()
  entity: string;

  @Column({ nullable: true })
  entityId: number;

  @Column({ type: 'text', nullable: true })
  changes: string; // JSON string with before/after

  @Column({ nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;
}
