import { Controller, Post, Get, Body } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('user')
export class UserController {
  constructor(private readonly service: UserService) {}

  // 🔐 SOMENTE ADMIN
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.service.create(dto);
  }

  // 🔐 SOMENTE ADMIN
  @Get()
  findAll() {
    return this.service.findAll();
  }
}
