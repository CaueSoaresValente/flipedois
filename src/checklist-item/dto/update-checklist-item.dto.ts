import { IsInt, Min } from 'class-validator';

export class UpdateChecklistItemDto {
  @IsInt()
  @Min(1)
  quantidadePlanejada: number;
}
