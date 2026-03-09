import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateOccurrenceDto {
  @IsOptional()
  @IsNumber()
  quantidade?: number;

  @IsOptional()
  @IsString()
  descricao?: string;
}
