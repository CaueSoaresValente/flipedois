import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  // Map userId -> Set<socketId> (um user pode ter varias abas)
  private userSockets = new Map<number, Set<string>>();

  handleConnection(client: Socket) {
    const userId = Number(client.handshake.query.userId);
    if (!userId || isNaN(userId)) return;

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);
    client.join(`user_${userId}`);
  }

  handleDisconnect(client: Socket) {
    const userId = Number(client.handshake.query.userId);
    if (!userId || isNaN(userId)) return;

    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  /**
   * Envia notificacao em tempo real para um usuario especifico.
   */
  sendToUser(userId: number, notification: any) {
    this.server?.to(`user_${userId}`).emit('notification', notification);
  }

  /**
   * Envia notificacao para todos os funcionarios conectados.
   */
  sendToAll(notification: any, userIds: number[]) {
    for (const userId of userIds) {
      this.sendToUser(userId, notification);
    }
  }
}
