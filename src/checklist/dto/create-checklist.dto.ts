import { IsNotEmpty, IsString, IsOptional, IsInt } from 'class-validator';

export class CreateChecklistDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsOptional()
  @IsInt()
  eventId?: number;
}
