import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { EventService } from './event.service';
import { CreateEventTeamDto } from './dto/create-event-team.dto';
import { UpdateEventTeamDto } from './dto/update-event-team.dto';

@Controller('event')
export class EventController {
  constructor(private readonly service: EventService) {}

  @Post()
  create(@Body() dto: CreateEventDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post(':id/equipe')
  adicionarEquipe(@Param('id') id: string, @Body() dto: CreateEventTeamDto) {
    return this.service.adicionarEquipe(Number(id), dto);
  }

  @Get(':id/equipe')
  listarEquipe(@Param('id') id: string) {
    return this.service.listarEquipe(Number(id));
  }

  @Patch('/event-team/:id')
  editarEquipe(@Param('id') id: string, @Body() dto: UpdateEventTeamDto) {
    return this.service.editarEquipe(Number(id), dto);
  }

  @Delete('/event-team/:id')
  removerEquipe(@Param('id') id: string) {
    return this.service.removerEquipe(Number(id));
  }
}
