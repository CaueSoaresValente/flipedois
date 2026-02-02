import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChecklistItem } from './checklist-item.entity';
import { ChecklistItemService } from './checklist-item.service';
import { ChecklistItemController } from './checklist-item.controller';
import { Equipment } from '../equipment/equipment.entity';
import { Checklist } from '../checklist/checklist.entity';
import { ChecklistItemHistoryModule } from '../checklist-item-history/checklist-item-history.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChecklistItem, Equipment, Checklist]),
    ChecklistItemHistoryModule, // ✅ agora funciona
  ],
  controllers: [ChecklistItemController],
  providers: [ChecklistItemService],
})
export class ChecklistItemModule {}
