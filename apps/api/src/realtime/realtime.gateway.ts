import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Namespace, Server, Socket } from 'socket.io';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from './realtime-events.service';

type TokenPayload = {
  sub: string;
  email: string;
};

type SocketData = {
  user?: AuthUser;
};

type AuthenticatedSocket = Socket & { data: SocketData };

@WebSocketGateway({
  namespace: '/realtime',
  transports: ['websocket', 'polling']
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly events: RealtimeEventsService
  ) {}

  afterInit(server: Server | Namespace) {
    this.events.attachServer(server);
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) throw new Error('Missing token');

      const payload = this.jwt.verify<TokenPayload>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: {
                    include: { permission: true }
                  }
                }
              }
            }
          }
        }
      });

      if (!user || user.status !== 'ACTIVE') {
        throw new Error('Inactive user');
      }

      const roles = user.roles.map((item) => item.role.code);
      const permissions = Array.from(
        new Set(
          user.roles.flatMap((item) =>
            item.role.permissions.map((entry) => entry.permission.code)
          )
        )
      );

      client.data.user = {
        sub: user.id,
        email: user.email,
        roles,
        permissions
      };

      await client.join(`user:${user.id}`);

      if (
        roles.some((role) =>
          ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(role)
        )
      ) {
        await client.join('role:dispatch');
      }

      if (roles.includes('DRIVER')) await client.join('role:driver');
      if (roles.includes('PASSENGER')) await client.join('role:passenger');

      client.emit('realtime.ready', {
        userId: user.id,
        roles,
        occurredAt: new Date().toISOString()
      });
    } catch {
      client.emit('realtime.auth.error', {
        message: 'رمز الاتصال المباشر غير صالح أو منتهي.'
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: AuthenticatedSocket) {
    // Socket.IO removes room memberships automatically.
  }

  @SubscribeMessage('trip.subscribe')
  async subscribeToTrip(
    client: AuthenticatedSocket,
    payload: { tripId?: string }
  ) {
    const user = client.data.user;
    const tripId = payload?.tripId?.trim();

    if (!user || !tripId) {
      throw new WsException('بيانات الاشتراك غير صحيحة.');
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { passengerId: true, driverId: true }
    });

    if (!trip) throw new WsException('الرحلة غير موجودة.');

    const isDispatch = user.roles.some((role: string) =>
      ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(role)
    );
    const isParticipant =
      trip.passengerId === user.sub || trip.driverId === user.sub;

    if (!isDispatch && !isParticipant) {
      throw new WsException('لا يمكنك الاشتراك في هذه الرحلة.');
    }

    await client.join(`trip:${tripId}`);

    return {
      event: 'trip.subscribed',
      data: { tripId }
    };
  }

  private extractToken(client: AuthenticatedSocket) {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }

    return undefined;
  }
}
