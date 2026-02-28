import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ChecklistService } from './checklist.service';
import { Roles } from '../auth/roles.decorator';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { CancelarChecklistDto } from './dto/cancelar-checklist.dto';

@Controller('checklist')
export class ChecklistController {
  constructor(private readonly service: ChecklistService) { }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateChecklistDto, @Req() req: any) {
    return this.service.create(dto.nome, dto.eventId, req.user.sub, req.user.email);
  }

  @Get()
  findAll(@Req() req: any) {
    return this.service.findAll(req.user.role);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Patch(':id/liberar')
  liberar(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.liberar(id, req.user.sub, req.user.email);
  }

  @Roles('ADMIN')
  @Patch(':id/vincular-evento')
  vincularEvento(
    @Param('id', ParseIntPipe) id: number,
    @Body('eventId', ParseIntPipe) eventId: number,
    @Req() req: any,
  ) {
    return this.service.vincularEvento(id, eventId, req.user.sub, req.user.email);
  }

  @Roles('ADMIN')
  @Post(':id/clonar')
  clonar(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.clonar(id, req.user.sub, req.user.email);
  }

  @Roles('ADMIN')
  @Patch(':id/cancelar')
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelarChecklistDto,
    @Req() req: any,
  ) {
    return this.service.cancelar(id, dto.motivo, req.user.email, req.user.sub);
  }

  @Get(':id/alertas')
  obterAlertas(@Param('id', ParseIntPipe) id: number) {
    return this.service.obterAlertas(id);
  }
}
