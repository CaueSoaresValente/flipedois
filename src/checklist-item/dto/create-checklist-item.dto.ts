import { IsInt, Min } from 'class-validator';

export class CreateChecklistItemDto {
  @IsInt()
  checklistId: number;

  @IsInt()
  equipmentId: number;

  @IsInt()
  @Min(1)
  quantidadePlanejada: number;
}
