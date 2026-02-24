import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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
import { CancelarSeparacaoDto } from './dto/cancelar-separacao.dto';

@Controller('checklist-item')
export class ChecklistItemController {
  constructor(private readonly service: ChecklistItemService) {}

  @Roles('ADMIN')
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateChecklistItemDto) {
    return this.service.create(dto);
  }

  @Patch(':id/separar')
  separar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SepararItemDto,
  ) {
    return this.service.separarItem(id, dto.quantidadeSeparada);
  }

  @Patch(':id/devolver')
  devolver(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DevolverItemDto,
  ) {
    return this.service.devolverItem(id, dto.quantidade, dto.situacao);
  }

  @Roles('ADMIN')
  @Patch(':id')
  updateQuantidade(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    return this.service.updateQuantidade(id, dto.quantidadePlanejada);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Roles('ADMIN')
  @Patch(':id/trocar')
  trocar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TrocarEquipmentDto,
  ) {
    return this.service.trocarEquipamento(
      id,
      dto.equipmentId,
      dto.quantidadePlanejada,
    );
  }

  @Patch(':id/cancelar-separacao')
  cancelarSeparacao(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelarSeparacaoDto,
  ) {
    return this.service.cancelarSeparacao(id, dto.quantidade);
  }
}
