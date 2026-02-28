import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Roles } from '../auth/roles.decorator';

@Controller('dashboard')
export class DashboardController {
    constructor(private readonly service: DashboardService) { }

    @Roles('ADMIN')
    @Get('stats')
    getStats() {
        return this.service.getStats();
    }
}
