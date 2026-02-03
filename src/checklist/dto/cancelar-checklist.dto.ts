import { IsNotEmpty, IsString } from 'class-validator';

export class CancelarChecklistDto {
  @IsString()
  @IsNotEmpty()
  motivo: string;
}
