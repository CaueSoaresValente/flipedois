import { IsInt, IsOptional, IsString, Min, IsBoolean } from 'class-validator';

export class UpdateEquipmentDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantidadeTotal?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
