import { IsInt, Min } from 'class-validator';

export class CancelarSeparacaoDto {
  @IsInt()
  @Min(1)
  quantidade: number;
}
