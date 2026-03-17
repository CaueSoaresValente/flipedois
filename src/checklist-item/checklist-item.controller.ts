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
import { AprovarTodosDto } from './dto/revisar-devolucao-lote.dto';

@Controller('checklist-item')
export class ChecklistItemController {
  constructor(private readonly service: ChecklistItemService) {}

  // Admin views all items
  @Roles('ADMIN')
  @Get()
  findAll() {
    return this.service.findAll();
  }

  // Admin creates items on draft checklists
  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateChecklistItemDto, @Req() req: any) {
    return this.service.create(dto, req.user.sub, req.user.email);
  }

  // ⚠️ ONLY FUNCIONARIO can perform separation — admin must NOT separate
  @Roles('FUNCIONARIO')
  @Patch(':id/separar')
  separar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SepararItemDto,
    @Req() req: any,
  ) {
    return this.service.separarItem(
      id,
      dto.quantidadeSeparada,
      req.user.sub,
      req.user.email,
    );
  }

  // 🔴 MIXED RETURN: Employee inputs OK + Damaged + Lost quantities per item
  // OK → stock updated immediately (emUso → disponivel)
  // DAMAGED/LOST → occurrence created (PENDENTE), stock NOT changed
  @Roles('FUNCIONARIO')
  @Patch(':id/devolver')
  devolver(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DevolverItemDto,
    @Req() req: any,
  ) {
    return this.service.devolverItem(
      id,
      dto.quantidadeOk,
      dto.quantidadeDanificada,
      dto.quantidadePerdida,
      dto.observacao,
      req.user.sub,
      req.user.email,
    );
  }

  // 🔴 ADMIN ONLY: Batch approve ALL pending occurrences in a checklist
  // Stock changes happen inside confirmarBaixa() via the occurrence service
  @Roles('ADMIN')
  @Post('aprovar-todos')
  aprovarTodos(@Body() dto: AprovarTodosDto, @Req() req: any) {
    return this.service.aprovarTodosPendentes(
      dto.checklistId,
      req.user.sub,
      req.user.email,
    );
  }

  // Admin updates planned quantity (rascunho/liberado/em_evento ONLY — BLOCKED during devolução)
  @Roles('ADMIN')
  @Patch(':id')
  updateQuantidade(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateChecklistItemDto,
    @Req() req: any,
  ) {
    return this.service.updateQuantidade(
      id,
      dto.quantidadePlanejada,
      req.user.sub,
      req.user.email,
    );
  }

  // Admin removes item (rascunho ou liberado)
  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user.sub, req.user.email);
  }

  // Admin swaps equipment in draft
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

  // Admin override: cancel/correct separation if needed
  @Roles('FUNCIONARIO', 'ADMIN')
  @Patch(':id/cancelar-separacao')
  cancelarSeparacao(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelarSeparacaoDto,
    @Req() req: any,
  ) {
    return this.service.cancelarSeparacao(
      id,
      dto.quantidade,
      req.user.sub,
      req.user.email,
    );
  }
}
