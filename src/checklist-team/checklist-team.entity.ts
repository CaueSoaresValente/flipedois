import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('checklist_team')
export class ChecklistTeam {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  checklistId: number;

  @Column()
  nome: string;

  @Column()
  funcao: 'montagem' | 'operacao' | 'desmontagem';
}
