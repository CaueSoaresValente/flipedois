import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Checklist } from 'src/checklist/checklist.entity';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { EventTeam } from './event-team.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Event, EventTeam, Checklist])],
  controllers: [EventController],
  providers: [EventService],
})
export class EventModule {}
