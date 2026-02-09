import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChecklistTeam } from './checklist-team.entity';
import { ChecklistTeamService } from './checklist-team.service';
import { ChecklistTeamController } from './checklist-team.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ChecklistTeam])],
  providers: [ChecklistTeamService],
  controllers: [ChecklistTeamController],
})
export class ChecklistTeamModule {}
