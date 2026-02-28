import { Controller, Get, Query } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { Roles } from '../auth/roles.decorator';

@Controller('audit-log')
export class AuditLogController {
    constructor(private readonly service: AuditLogService) { }

    @Roles('ADMIN')
    @Get()
    findAll(
        @Query('userId') userId?: string,
        @Query('entity') entity?: string,
        @Query('action') action?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        return this.service.findAll({
            userId: userId ? Number(userId) : undefined,
            entity,
            action,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            limit: limit ? Number(limit) : undefined,
            offset: offset ? Number(offset) : undefined,
        });
    }
}
