import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateEventTeamDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsIn(['montagem', 'operacao', 'desmontagem'])
  funcao?: 'montagem' | 'operacao' | 'desmontagem';
}
