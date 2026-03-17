import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class DevolverItemDto {
  @IsNumber()
  @Min(0)
  quantidadeOk: number;

  @IsNumber()
  @Min(0)
  quantidadeDanificada: number;

  @IsNumber()
  @Min(0)
  quantidadePerdida: number;

  @IsOptional()
  @IsString()
  observacao?: string;
}
