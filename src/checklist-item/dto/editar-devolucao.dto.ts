import { IsNumber, Min } from 'class-validator';

export class EditarDevolucaoDto {
  @IsNumber()
  @Min(0)
  ok: number;

  @IsNumber()
  @Min(0)
  quebrado: number;

  @IsNumber()
  @Min(0)
  perdido: number;
}
