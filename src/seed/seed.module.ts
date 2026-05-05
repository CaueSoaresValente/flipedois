import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Equipment } from '../equipment/equipment.entity';
import { Event } from '../event/event.entity';
import { Checklist } from '../checklist/checklist.entity';
import { ChecklistItem } from '../checklist-item/checklist-item.entity';
import { EventTeam } from '../event/event-team.entity';
import { EquipmentOccurrence } from '../equipment-occurrence/equipment-occurrence.entity';
import { User } from '../user/user.entity';
import { SystemPopulatorSeed } from './system-populator.seed';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Equipment,
      Event,
      Checklist,
      ChecklistItem,
      EventTeam,
      EquipmentOccurrence,
      User,
    ]),
  ],
  providers: [SystemPopulatorSeed],
  exports: [SystemPopulatorSeed],
})
export class SeedModule implements OnModuleInit {
  constructor(private readonly systemPopulator: SystemPopulatorSeed) {}

  async onModuleInit() {
    await this.systemPopulator.onModuleInit();
  }
}
