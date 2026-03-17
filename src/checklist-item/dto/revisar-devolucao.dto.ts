import { IsNumber, Min } from 'class-validator';

export class RevisarDevolucaoDto {
  @IsNumber()
  @Min(0)
  ok: number;

  @IsNumber()
  @Min(0)
  danificado: number;

  @IsNumber()
  @Min(0)
  perdido: number;
}
