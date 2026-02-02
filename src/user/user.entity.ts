import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export type UserRole = 'ADMIN' | 'FUNCIONARIO';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nome: string;

  @Column({ unique: true })
  email: string;

  @Column()
  senha: string;

  @Column({ default: 'FUNCIONARIO' })
  role: UserRole;

  @Column({ default: true })
  ativo: boolean;
}
