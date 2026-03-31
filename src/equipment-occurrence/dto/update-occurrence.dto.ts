import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateOccurrenceDto {
  @IsOptional()
  @IsNumber()
  quantidade?: number;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsString()
  tipo?: 'OK' | 'DANO' | 'PERDA';

  @IsOptional()
  @IsNumber()
  equipmentId?: number;
}
