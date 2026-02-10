import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Event } from './event.entity';
import { EventTeam } from './event-team.entity';
import { Checklist } from 'src/checklist/checklist.entity';

import { EventController } from './event.controller';
import { EventService } from './event.service';

@Module({
  imports: [TypeOrmModule.forFeature([Event, EventTeam, Checklist])],
  controllers: [EventController],
  providers: [EventService],
})
export class EventModule {}
