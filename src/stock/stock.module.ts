import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Equipment } from '../equipment/equipment.entity';
import { StockService } from './stock.service';

@Module({
  imports: [TypeOrmModule.forFeature([Equipment])],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
