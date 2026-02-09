import { IsIn, IsInt, Min } from 'class-validator';

export class CreateChecklistItemDto {
  @IsInt()
  checklistId: number;

  @IsInt()
  equipmentId: number;

  @IsInt()
  @Min(1)
  quantidadePlanejada: number;

  @IsIn(['som', 'luz', 'video', 'estrutura'])
  setor: 'som' | 'luz' | 'video' | 'estrutura';
}
