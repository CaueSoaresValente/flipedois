import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { Public } from '../auth/public.decorator';

@Controller('user')
export class UserController {
  constructor(private readonly service: UserService) {}

  @Public()
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }
}
