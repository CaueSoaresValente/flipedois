import { IsInt, Min } from 'class-validator';

export class TrocarEquipmentDto {
  @IsInt()
  equipmentId: number;

  @IsInt()
  @Min(1)
  quantidadePlanejada: number;
}
