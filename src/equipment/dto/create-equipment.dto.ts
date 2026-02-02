import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateEquipmentDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsString()
  descricao: string;

  @IsInt()
  @Min(0)
  quantidadeTotal: number;
}
