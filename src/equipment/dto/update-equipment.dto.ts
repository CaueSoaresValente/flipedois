import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateEquipmentDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantidadeTotal?: number;

  @IsOptional()
  @IsString()
  descricao?: string;
}
