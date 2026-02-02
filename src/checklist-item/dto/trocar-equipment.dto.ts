import { IsInt } from 'class-validator';

export class TrocarEquipmentDto {
  @IsInt()
  equipmentId: number;
}
