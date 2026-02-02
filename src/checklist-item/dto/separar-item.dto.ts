import { IsInt, Min } from 'class-validator';

export class SepararItemDto {
  @IsInt()
  @Min(1)
  quantidadeSeparada: number;
}
