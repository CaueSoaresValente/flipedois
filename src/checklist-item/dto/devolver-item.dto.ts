import { IsInt, Min } from 'class-validator';

export class DevolverItemDto {
  @IsInt()
  @Min(1)
  quantidadeDevolvida: number;
}
