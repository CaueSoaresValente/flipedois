import { Controller, Post, Get, Body, Query, Patch, Param, ParseIntPipe, Req } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { Roles } from '../auth/roles.decorator';

@Roles('ADMIN')
@Controller('user')
export class UserController {
  constructor(private readonly service: UserService) {}

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

  @Patch(':id/desativar')
  desativar(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.desativar(id, req.user.sub);
  }

  @Patch(':id/reativar')
  reativar(@Param('id', ParseIntPipe) id: number) {
    return this.service.reativar(id);
  }
}
