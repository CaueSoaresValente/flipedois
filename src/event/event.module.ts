import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Event } from './event.entity';
import { EventTeam } from './event-team.entity';
import { Checklist } from '../checklist/checklist.entity';
import { ChecklistItem } from '../checklist-item/checklist-item.entity';

import { EventController } from './event.controller';
import { EventService } from './event.service';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, EventTeam, Checklist, ChecklistItem]),
    StockModule,
  ],
  controllers: [EventController],
  providers: [EventService],
})
export class EventModule {}
