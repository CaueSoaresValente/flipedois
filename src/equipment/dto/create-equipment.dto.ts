import {
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  IsOptional,
  IsIn,
} from 'class-validator';

export class CreateEquipmentDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsString()
  descricao: string;

  @IsInt()
  @Min(0)
  quantidadeTotal: number;

  @IsOptional()
  @IsIn(['interno', 'alugado'])
  origem?: 'interno' | 'alugado';

  @IsOptional()
  @IsString()
  fornecedor?: string;
}
