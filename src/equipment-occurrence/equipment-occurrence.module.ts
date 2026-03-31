import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EquipmentOccurrence } from './equipment-occurrence.entity';
import { EquipmentOccurrenceService } from './equipment-occurrence.service';
import { EquipmentOccurrenceController } from './equipment-occurrence.controller';

import { Equipment } from '../equipment/equipment.entity';
import { Event } from '../event/event.entity';
import { ChecklistItem } from '../checklist-item/checklist-item.entity';
import { Checklist } from '../checklist/checklist.entity';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EquipmentOccurrence,
      Equipment,
      Event,
      ChecklistItem,
      Checklist,
    ]),
    StockModule,
  ],
  controllers: [EquipmentOccurrenceController],
  providers: [EquipmentOccurrenceService],
  exports: [EquipmentOccurrenceService],
})
export class EquipmentOccurrenceModule {}
