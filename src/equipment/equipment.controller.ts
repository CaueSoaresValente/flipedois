import { Body, Controller, Get, Post } from '@nestjs/common';
import { EquipmentService } from './equipment.service';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { Roles } from '../auth/roles.decorator';
import { Patch, Param } from '@nestjs/common';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';

@Controller('equipment')
export class EquipmentController {
  constructor(private readonly service: EquipmentService) {}

  // 🔐 Só ADMIN cria
  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateEquipmentDto) {
    return this.service.create(dto);
  }

  // 👷 ADMIN e FUNCIONARIO podem ver
  @Roles('ADMIN', 'FUNCIONARIO')
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEquipmentDto) {
    return this.service.update(Number(id), dto);
  }
}
