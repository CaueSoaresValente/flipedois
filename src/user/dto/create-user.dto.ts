import { IsEmail, IsEnum, IsNotEmpty, MinLength } from 'class-validator';
import type { UserRole } from '../user.entity';

export class CreateUserDto {
  @IsNotEmpty()
  nome: string;

  @IsEmail()
  email: string;

  @MinLength(6)
  senha: string;

  @IsEnum(['ADMIN', 'FUNCIONARIO'])
  role?: UserRole;
}
