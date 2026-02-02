import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) { }

  async login(email: string, senha: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    const ok = await bcrypt.compare(senha, user.senha);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas');

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role, // 🔥 ESSENCIAL
    };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
