import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class CreateEventTeamDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsIn(['montagem', 'operacao', 'desmontagem'])
  funcao: 'montagem' | 'operacao' | 'desmontagem';
}
