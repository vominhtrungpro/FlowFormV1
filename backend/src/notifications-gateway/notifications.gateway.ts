import { Injectable } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

// Replaces Hubs/NotificationHub.cs: on connect, verify the JWT passed in the handshake (React
// sends it via `io(url, { auth: { token } })`) and join room `user-{id}` — same grouping strategy
// as the old SignalR hub's `Groups.AddToGroupAsync(connectionId, "user-{id}")`. Push-only (server
// -> client), no client-invoked methods, matching the old hub's shape exactly.
@Injectable()
@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173', credentials: true } })
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(private jwt: JwtService, private config: ConfigService) {}

  handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth?.token as string) || (client.handshake.query?.token as string);
      const payload = this.jwt.verify(token, {
        secret: this.config.get<string>('JWT_SECRET'),
        issuer: this.config.get<string>('JWT_ISSUER'),
        audience: this.config.get<string>('JWT_ISSUER'),
      });
      client.join(`user-${payload.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  emitToUser(userId: number, payload: unknown) {
    this.server.to(`user-${userId}`).emit('notify', payload);
  }
}
