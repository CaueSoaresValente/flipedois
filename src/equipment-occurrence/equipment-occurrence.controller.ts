import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { EquipmentOccurrenceService } from './equipment-occurrence.service';
import { CreateOccurrenceDto } from './dto/create-occurrence.dto';
import { UpdateOccurrenceDto } from './dto/update-occurrence.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('equipment-occurrence')
export class EquipmentOccurrenceController {
  constructor(private readonly service: EquipmentOccurrenceService) {}

  @Roles('ADMIN')
  @Post()
  registrar(@Body() dto: CreateOccurrenceDto) {
    return this.service.registrar(
      dto.eventId ?? null,
      dto.equipmentId,
      dto.quantidade,
      dto.descricao,
      dto.tipo ?? 'DANO',
      true, // manual 
    );
  }

  @Roles('ADMIN')
  @Patch(':id/confirmar')
  confirmar(@Param('id', ParseIntPipe) id: number) {
    return this.service.confirmarBaixa(id);
  }  @Roles('ADMIN')
  @Patch(':id/cancelar')
  cancelar(@Param('id', ParseIntPipe) id: number) {
    return this.service.cancelar(id);
  }
  @Roles('ADMIN')
  @Patch(':id')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOccurrenceDto,
  ) {
    return this.service.editar(
      id,
      dto.quantidade,
      dto.descricao,
      dto.tipo,
      dto.equipmentId,
    );
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

