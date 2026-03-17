import { IsArray, IsNumber, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ItemRevisaoDto {
  @IsNumber()
  itemId: number;

  @IsNumber()
  @Min(0)
  ok: number;

  @IsNumber()
  @Min(0)
  danificado: number;

  @IsNumber()
  @Min(0)
  perdido: number;
}

export class RevisarDevolucaoEmLoteDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemRevisaoDto)
  items: ItemRevisaoDto[];
}

export class AprovarTodosDto {
  @IsNumber()
  checklistId: number;
}
