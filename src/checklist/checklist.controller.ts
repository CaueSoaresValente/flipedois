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

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Patch(':id/liberar')
  liberar(@Param('id', ParseIntPipe) id: number) {
    return this.service.liberar(id);
  }

  @Roles('ADMIN')
  @Post(':id/clonar')
  clonar(@Param('id', ParseIntPipe) id: number) {
    return this.service.clonar(id);
  }

  @Roles('ADMIN')
  @Patch(':id/cancelar')
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelarChecklistDto,
    @Req() req: any,
  ) {
    return this.service.cancelar(id, dto.motivo, req.user.email);
  }

  @Get(':id/alertas')
  obterAlertas(@Param('id', ParseIntPipe) id: number) {
    return this.service.obterAlertas(id);
  }
}
