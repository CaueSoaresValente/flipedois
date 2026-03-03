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
import { CreateEventDto } from './dto/create-event.dto';
import { EventService } from './event.service';
import { CreateEventTeamDto } from './dto/create-event-team.dto';
import { UpdateEventTeamDto } from './dto/update-event-team.dto';
import { Roles } from '../auth/roles.decorator';
import { IsString, IsNotEmpty } from 'class-validator';

class CancelarEventoDto {
  @IsString()
  @IsNotEmpty()
  motivo: string;
}

@Controller('event')
export class EventController {
  constructor(private readonly service: EventService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateEventDto, @Req() req: any) {
    return this.service.create(dto, req.user.sub, req.user.email);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post(':id/equipe')
  adicionarEquipe(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEventTeamDto,
  ) {
    return this.service.adicionarEquipe(id, dto);
  }

  @Get(':id/equipe')
  listarEquipe(@Param('id', ParseIntPipe) id: number) {
    return this.service.listarEquipe(id);
  }

  @Patch('event-team/:id')
  editarEquipe(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEventTeamDto,
  ) {
    return this.service.editarEquipe(id, dto);
  }

  @Roles('ADMIN')
  @Delete('event-team/:id')
  removerEquipe(@Param('id', ParseIntPipe) id: number) {
    return this.service.removerEquipe(id);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateEventDto>,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, req.user.sub, req.user.email);
  }

  @Roles('ADMIN')
  @Patch(':id/finalizar')
  finalizar(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.finalizar(id, req.user.sub, req.user.email);
  }

  @Roles('ADMIN')
  @Patch(':id/cancelar')
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelarEventoDto,
    @Req() req: any,
  ) {
    return this.service.cancelar(id, dto.motivo, req.user.sub, req.user.email);
  }
}
