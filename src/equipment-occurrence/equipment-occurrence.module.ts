import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EquipmentOccurrence } from './equipment-occurrence.entity';
import { EquipmentOccurrenceService } from './equipment-occurrence.service';
import { EquipmentOccurrenceController } from './equipment-occurrence.controller';

import { Equipment } from '../equipment/equipment.entity';
import { Event } from '../event/event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EquipmentOccurrence,
      Equipment,
      Event,
    ]),
  ],
  controllers: [EquipmentOccurrenceController],
  providers: [EquipmentOccurrenceService],
})
export class EquipmentOccurrenceModule {}