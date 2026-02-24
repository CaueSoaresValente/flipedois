import { IsNumber, IsOptional, IsString } from 'class-validator';

export class DevolverItemDto {
  @IsNumber()
  quantidade: number;

  @IsString()
  situacao: 'ok' | 'quebrado' | 'perdido';

  @IsOptional()
  @IsString()
  observacao?: string;
}
