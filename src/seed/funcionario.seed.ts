import { Injectable, OnModuleInit } from '@nestjs/common';
import { UserService } from '../user/user.service';

@Injectable()
export class FuncSeed implements OnModuleInit {
  constructor(private readonly userService: UserService) {}

  async onModuleInit() {
    const exists = await this.userService.findByEmail('func@email.com');

    if (!exists) {
      await this.userService.create({
        nome: 'Funcionario',
        email: 'func@email.com',
        senha: '123456',
        role: 'FUNCIONARIO',
      });

      console.log('✅ Usuário FUNCIONARIO criado');
    }
  }
}
