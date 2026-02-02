import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AdminSeed } from '../seed/admin.seed';
import { FuncSeed } from '../seed/funcionario.seed';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UserService, AdminSeed, FuncSeed],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
