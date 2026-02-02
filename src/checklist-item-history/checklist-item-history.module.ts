import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChecklistItemHistory } from './checklist-item-history.entity';
import { ChecklistItemHistoryService } from './checklist-item-history.service';
import { ChecklistItemHistoryController } from './checklist-item-history.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChecklistItemHistory]),
  ],
  controllers: [ChecklistItemHistoryController],
  providers: [ChecklistItemHistoryService],
  exports: [ChecklistItemHistoryService],
})
export class ChecklistItemHistoryModule {}
