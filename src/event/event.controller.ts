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
import { CreateEventDto } from './dto/create-event.dto';
import { EventService } from './event.service';
import { CreateEventTeamDto } from './dto/create-event-team.dto';
import { UpdateEventTeamDto } from './dto/update-event-team.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('event')
export class EventController {
  constructor(private readonly service: EventService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateEventDto) {
    return this.service.create(dto);
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
}
