import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ChecklistItemService } from './checklist-item.service';
import { Roles } from '../auth/roles.decorator';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { SepararItemDto } from './dto/separar-item.dto';
import { DevolverItemDto } from './dto/devolver-item.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';
import { TrocarEquipmentDto } from './dto/trocar-equipment.dto';

@Controller('checklist-item')
export class ChecklistItemController {
  constructor(private readonly service: ChecklistItemService) {}

  // 🔹 ADMIN – LISTAR ITENS
  @Get()
  @Roles('ADMIN')
  findAll() {
    return this.service.findAll();
  }

  @Roles('ADMIN')
  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateChecklistItemDto) {
    return this.service.create(dto);
  }

  @Roles('FUNCIONARIO')
  @Patch(':id/separar')
  @Roles('FUNCIONARIO')
  separar(@Param('id') id: string, @Body() dto: SepararItemDto) {
    return this.service.separarItem(Number(id), dto.quantidadeSeparada);
  }

  @Roles('FUNCIONARIO')
  @Patch(':id/devolver')
  devolver(@Param('id') id: string, @Body() dto: DevolverItemDto) {
    return this.service.devolverItem(Number(id), dto.quantidadeDevolvida);
  }

  @Roles('ADMIN')
  @Patch(':id')
  updateQuantidade(
    @Param('id') id: string,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    return this.service.updateQuantidade(Number(id), dto.quantidadePlanejada);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }

  @Roles('ADMIN')
  @Patch(':id/trocar')
  trocar(@Param('id') id: string, @Body() dto: TrocarEquipmentDto) {
    return this.service.trocarEquipamento(Number(id), dto.equipmentId);
  }
}
