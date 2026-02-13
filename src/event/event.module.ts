import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Event } from './event.entity';
import { EventTeam } from './event-team.entity';
import { Checklist } from 'src/checklist/checklist.entity';

import { EventController } from './event.controller';
import { EventService } from './event.service';
import { Equipment } from 'src/equipment/equipment.entity';
import { EquipmentReservation } from 'src/equipment/equipment-reservation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Event, EventTeam, Checklist, Equipment, EquipmentReservation])],
  controllers: [EventController],
  providers: [EventService],
})
export class EventModule {}
