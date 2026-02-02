import { IsInt, Min } from 'class-validator';

export class UpdateChecklistItemDto {
  @IsInt()
  @Min(0)
  quantidadePlanejada: number;
}
