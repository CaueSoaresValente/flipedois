import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  IsBoolean,
  MinLength,
  IsIn,
} from 'class-validator';

export class UpdateEquipmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Nome não pode ser vazio' })
  nome?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Descrição não pode ser vazia' })
  descricao?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantidadeTotal?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsIn(['interno', 'alugado'])
  origem?: 'interno' | 'alugado';

  @IsOptional()
  @IsString()
  fornecedor?: string;
}
