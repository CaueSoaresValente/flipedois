import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateOccurrenceDto {
  @IsOptional()
  @IsNumber()
  eventId?: number;

  @IsNumber()
  equipmentId: number;

  @IsNumber()
  quantidade: number;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsString()
  tipo?: 'OK' | 'DANO' | 'PERDA';
}
