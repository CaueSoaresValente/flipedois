import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { EquipmentOccurrenceService } from './equipment-occurrence.service';
import { CreateOccurrenceDto } from './dto/create-occurrence.dto';
import { UpdateOccurrenceDto } from './dto/update-occurrence.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('equipment-occurrence')
export class EquipmentOccurrenceController {
  constructor(private readonly service: EquipmentOccurrenceService) {}

  @Post()
  registrar(@Body() dto: CreateOccurrenceDto) {
    return this.service.registrar(
      dto.eventId ?? null,
      dto.equipmentId,
      dto.quantidade,
      dto.descricao,
      dto.tipo ?? 'DANO',
      dto.motivo,
      true, // manual occurrence — adjust stock immediately for DANO/PERDA
    );
  }

  @Roles('ADMIN')
  @Patch(':id/confirmar')
  confirmar(@Param('id', ParseIntPipe) id: number) {
    return this.service.confirmarBaixa(id);
  }

  @Roles('ADMIN')
  @Patch(':id/cancelar')
  cancelar(@Param('id', ParseIntPipe) id: number) {
    return this.service.cancelar(id);
  }

  @Roles('ADMIN')
  @Patch(':id/resolver')
  resolver(@Param('id', ParseIntPipe) id: number) {
    return this.service.resolver(id);
  }

  @Roles('ADMIN')
  @Patch(':id/achar')
  achar(@Param('id', ParseIntPipe) id: number) {
    return this.service.achar(id);
  }

  @Roles('ADMIN')
  @Patch(':id')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOccurrenceDto,
  ) {
    return this.service.editar(id, dto.quantidade, dto.descricao);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }
}

