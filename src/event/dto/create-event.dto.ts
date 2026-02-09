import { IsString, IsDateString, IsInt, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TeamDto {
  @IsString()
  nome: string;

  @IsString()
  funcao: 'montagem' | 'operacao' | 'desmontagem';
}

export class CreateEventDto {
  @IsString()
  nome: string;

  @IsString()
  cliente: string;

  @IsString()
  local: string;

  @IsDateString()
  dataInicio: string;

  @IsDateString()
  dataFim: string;

  @IsInt()
  checklistId: number;

  @ValidateNested({ each: true })
  @Type(() => TeamDto)
  equipe: TeamDto[];

  @IsString()
  observacoes?: string;
}
