import { IsNotEmpty, IsString, IsInt } from 'class-validator';

export class CreateChecklistDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsInt()
  eventId: number;
}
