import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ChecklistService } from './checklist.service';
import { Roles } from '../auth/roles.decorator';
import { CreateChecklistDto } from './dto/create-checklist.dto';

@Controller('checklist')
export class ChecklistController {
  constructor(private readonly service: ChecklistService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateChecklistDto) {
    return this.service.create(dto.nome);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles('ADMIN')
  @Patch(':id/liberar')
  liberar(@Param('id') id: string) {
    return this.service.liberar(Number(id));
  }

  @Roles('ADMIN')
  @Patch(':id/clonar')
  clonar(@Param('id') id: string) {
    return this.service.clonar(Number(id));
  }

  @Roles('ADMIN')
  @Patch(':id/cancelar')
  cancelar(@Param('id') id: string) {
    return this.service.cancelar(Number(id));
  }
}
