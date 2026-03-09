import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { EquipmentService } from './equipment.service';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { Roles } from '../auth/roles.decorator';
import { Patch, Param } from '@nestjs/common';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';

@Controller('equipment')
export class EquipmentController {
  constructor(private readonly service: EquipmentService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateEquipmentDto, @Req() req: any) {
    return this.service.create(dto, req.user.sub, req.user.email);
  }

  @Roles('ADMIN', 'FUNCIONARIO')
  @Get()
  findAll() {
    return this.service.findAll();
  }

  // Fix #1: Search endpoint for autocomplete
  @Roles('ADMIN', 'FUNCIONARIO')
  @Get('search')
  search(@Query('q') q: string, @Query('setor') setor?: string) {
    return this.service.search(q ?? '', setor);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEquipmentDto,
    @Req() req: any,
  ) {
    return this.service.update(Number(id), dto, req.user.sub, req.user.email);
  }

  @Roles('ADMIN')
  @Patch(':id/desativar')
  desativar(@Param('id') id: string, @Req() req: any) {
    return this.service.desativar(Number(id), req.user.sub, req.user.email);
  }
}
