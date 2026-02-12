import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';

import { UserModule } from './user/user.module';
import { ChecklistModule } from './checklist/checklist.module';
import { ChecklistItemModule } from './checklist-item/checklist-item.module';
import { ChecklistItemHistoryModule } from './checklist-item-history/checklist-item-history.module';
import { EquipmentModule } from './equipment/equipment.module';
import { ChecklistTeamModule } from './checklist-team/checklist-team.module';
import { EventModule } from './event/event.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'eventos',
      autoLoadEntities: true,
      synchronize: true,
    }),
    AuthModule,
    UserModule,
    ChecklistModule,
    ChecklistItemModule,
    ChecklistItemHistoryModule,
    EquipmentModule,
    ChecklistTeamModule,
    EventModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
