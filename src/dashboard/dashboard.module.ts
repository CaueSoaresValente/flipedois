import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Equipment } from '../equipment/equipment.entity';
import { Checklist } from '../checklist/checklist.entity';
import { Event } from '../event/event.entity';
import { EquipmentOccurrence } from '../equipment-occurrence/equipment-occurrence.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Equipment,
            Checklist,
            Event,
            EquipmentOccurrence,
        ]),
    ],
    controllers: [DashboardController],
    providers: [DashboardService],
})
export class DashboardModule { }
