import { IsIn, IsString } from 'class-validator';

export class CreateChecklistTeamDto {
  @IsString()
  nome: string;

  @IsIn(['montagem', 'operacao', 'desmontagem'])
  funcao: 'montagem' | 'operacao' | 'desmontagem';

  checklistId: number;
}
