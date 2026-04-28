import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Checklist } from './checklist.entity';
import { ChecklistItem } from '../checklist-item/checklist-item.entity';
import { Equipment } from '../equipment/equipment.entity';
import { Event } from '../event/event.entity';
import { ChecklistService } from './checklist.service';
import { ChecklistController } from './checklist.controller';
import { AuthModule } from '../auth/auth.module';
import { StockModule } from '../stock/stock.module';
import { EventModule } from '../event/event.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Checklist, ChecklistItem, Equipment, Event]),
    AuthModule,
    StockModule,
    EventModule,
  ],
  providers: [ChecklistService],
  controllers: [ChecklistController],
})
export class ChecklistModule {}
