import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Equipment } from './equipment.entity';
import { EquipmentService } from './equipment.service';
import { EquipmentController } from './equipment.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Equipment])],
  controllers: [EquipmentController],
  providers: [EquipmentService],
  exports: [TypeOrmModule],
})
export class EquipmentModule {}
