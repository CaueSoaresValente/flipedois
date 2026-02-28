import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
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
  constructor(private readonly service: ChecklistItemService) { }

  @Roles('ADMIN')
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateChecklistItemDto, @Req() req: any) {
    return this.service.create(dto, req.user.sub, req.user.email);
  }

  // Fix #7: Only FUNCIONARIO can separate — ADMIN cannot
  @Roles('FUNCIONARIO')
  @Patch(':id/separar')
  separar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SepararItemDto,
    @Req() req: any,
  ) {
    return this.service.separarItem(id, dto.quantidadeSeparada, req.user.sub, req.user.email);
  }

  // Fix #7: Only FUNCIONARIO can return — ADMIN cannot
  @Roles('FUNCIONARIO')
  @Patch(':id/devolver')
  devolver(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DevolverItemDto,
    @Req() req: any,
  ) {
    return this.service.devolverItem(id, dto.quantidade, dto.situacao, req.user.sub, req.user.email);
  }

  @Roles('ADMIN')
  @Patch(':id')
  updateQuantidade(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateChecklistItemDto,
    @Req() req: any,
  ) {
    return this.service.updateQuantidade(id, dto.quantidadePlanejada, req.user.sub, req.user.email);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user.sub, req.user.email);
  }

  @Roles('ADMIN')
  @Patch(':id/trocar')
  trocar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TrocarEquipmentDto,
    @Req() req: any,
  ) {
    return this.service.trocarEquipamento(
      id,
      dto.equipmentId,
      dto.quantidadePlanejada,
      req.user.sub,
      req.user.email,
    );
  }

  @Roles('FUNCIONARIO')
  @Patch(':id/cancelar-separacao')
  cancelarSeparacao(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelarSeparacaoDto,
    @Req() req: any,
  ) {
    return this.service.cancelarSeparacao(id, dto.quantidade, req.user.sub, req.user.email);
  }
}
