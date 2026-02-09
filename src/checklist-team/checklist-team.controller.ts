import { Body, Controller, Get, Param, Post, Delete } from '@nestjs/common';
import { ChecklistTeamService } from './checklist-team.service';
import { Roles } from '../auth/roles.decorator';

@Controller('checklist-team')
export class ChecklistTeamController {
  constructor(private readonly service: ChecklistTeamService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() dto) {
    return this.service.create(dto);
  }

  @Roles('ADMIN')
  @Get(':checklistId')
  find(@Param('checklistId') id: string) {
    return this.service.findByChecklist(Number(id));
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }
}
