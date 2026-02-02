import { Injectable, OnModuleInit } from '@nestjs/common';
import { UserService } from '../user/user.service';

@Injectable()
export class AdminSeed implements OnModuleInit {
  constructor(private readonly userService: UserService) {}

  async onModuleInit() {
    const adminExists = await this.userService.findByEmail('admin@email.com');

    if (!adminExists) {
      await this.userService.create({
        nome: 'Admin',
        email: 'admin@email.com',
        senha: '123456',
        role: 'ADMIN',
      });

      console.log('✅ Usuário ADMIN criado automaticamente');
    }
  }
}
