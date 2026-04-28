import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller('notification')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  /** Lista notificações do usuário logado (paginado) */
  @Get()
  findAll(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findByUser(
      req.user.sub,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  /** Contagem de notificações não lidas */
  @Get('unread-count')
  async unreadCount(@Req() req: any) {
    const count = await this.service.countUnread(req.user.sub);
    return { count };
  }

  /** Marca uma notificação como lida */
  @Patch(':id/read')
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.service.markAsRead(id, req.user.sub);
  }

  /** Marca todas as notificações do usuário como lidas */
  @Patch('read-all')
  markAllAsRead(@Req() req: any) {
    return this.service.markAllAsRead(req.user.sub);
  }
}
