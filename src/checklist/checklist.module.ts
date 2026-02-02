import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Checklist } from './checklist.entity';
import { ChecklistItem } from '../checklist-item/checklist-item.entity';
import { Equipment } from '../equipment/equipment.entity';
import { ChecklistService } from './checklist.service';
import { ChecklistController } from './checklist.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Checklist,
      ChecklistItem, // ✅ NECESSÁRIO
      Equipment, // ✅ NECESSÁRIO
    ]),
    AuthModule,
  ],
  providers: [ChecklistService],
  controllers: [ChecklistController],
})
export class ChecklistModule {}
