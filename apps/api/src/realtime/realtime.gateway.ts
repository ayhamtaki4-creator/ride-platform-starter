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
import { createHash } from 'crypto';
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
  publicTripId?: string;
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
      if (token) {
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
        return;
      }

      const trackingToken = this.extractTrackingToken(client);
      if (!trackingToken) throw new Error('Missing token');

      const tokenHash = createHash('sha256').update(trackingToken).digest('hex');
      const shares = await this.prisma.$queryRaw<Array<{ tripId: string }>>`
        SELECT s."tripId"
        FROM "TripTrackingShare" s
        INNER JOIN "Trip" t ON t."id" = s."tripId"
        WHERE s."tokenHash" = ${tokenHash}
          AND s."revokedAt" IS NULL
          AND s."expiresAt" > CURRENT_TIMESTAMP
          AND t."status"::text NOT IN (
            'COMPLETED',
            'CANCELLED_BY_PASSENGER',
            'CANCELLED_BY_DRIVER',
            'NO_DRIVER_AVAILABLE',
            'PASSENGER_NO_SHOW',
            'DRIVER_NO_SHOW'
          )
        LIMIT 1
      `;
      const share = shares[0];
      if (!share) throw new Error('Invalid tracking token');

      client.data.publicTripId = share.tripId;
      await client.join(`public-trip:${share.tripId}`);
      client.emit('tracking.ready', {
        tripId: share.tripId,
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

  @SubscribeMessage('trip.location.update')
  async updateTripLocation(
    client: AuthenticatedSocket,
    payload: {
      tripId?: string;
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      heading?: number;
      speed?: number;
      recordedAt?: string;
    }
  ) {
    const user = client.data.user;
    const tripId = payload?.tripId?.trim();
    if (!user || !tripId || !user.roles.includes('DRIVER')) {
      throw new WsException('لا يمكنك إرسال موقع لهذه الرحلة.');
    }

    const latitude = Number(payload.latitude);
    const longitude = Number(payload.longitude);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      throw new WsException('إحداثيات الموقع غير صحيحة.');
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { passengerId: true, driverId: true, status: true }
    });
    if (!trip || trip.driverId !== user.sub) {
      throw new WsException('هذه الرحلة ليست معيّنة لك.');
    }
    if (
      !['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS'].includes(
        trip.status
      )
    ) {
      throw new WsException('لا يمكن إرسال الموقع في حالة الرحلة الحالية.');
    }

    const parsedRecordedAt = payload.recordedAt
      ? new Date(payload.recordedAt)
      : new Date();
    const recordedAt = Number.isNaN(parsedRecordedAt.getTime())
      ? new Date()
      : parsedRecordedAt;
    const finiteOrNull = (value?: number) =>
      value == null || !Number.isFinite(Number(value)) ? null : Number(value);

    await this.prisma.$executeRaw`
      INSERT INTO "TripLiveLocation" (
        "tripId", "driverId", "latitude", "longitude", "accuracy", "heading", "speed", "recordedAt", "updatedAt"
      ) VALUES (
        ${tripId}::uuid, ${user.sub}::uuid, ${latitude}, ${longitude},
        ${finiteOrNull(payload.accuracy)}, ${finiteOrNull(payload.heading)}, ${finiteOrNull(payload.speed)},
        ${recordedAt}, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("tripId") DO UPDATE SET
        "driverId" = EXCLUDED."driverId",
        "latitude" = EXCLUDED."latitude",
        "longitude" = EXCLUDED."longitude",
        "accuracy" = EXCLUDED."accuracy",
        "heading" = EXCLUDED."heading",
        "speed" = EXCLUDED."speed",
        "recordedAt" = EXCLUDED."recordedAt",
        "updatedAt" = CURRENT_TIMESTAMP
    `;

    const event = {
      tripId,
      driverId: user.sub,
      latitude,
      longitude,
      accuracy: finiteOrNull(payload.accuracy),
      heading: finiteOrNull(payload.heading),
      speed: finiteOrNull(payload.speed),
      recordedAt: recordedAt.toISOString()
    };

    this.server.to(`trip:${tripId}`).emit('trip.location.updated', event);
    this.server.to(`public-trip:${tripId}`).emit('trip.location.updated', event);
    this.server.to(`user:${trip.passengerId}`).emit('trip.location.updated', event);
    this.server.to('role:dispatch').emit('trip.location.updated', event);
    client.emit('trip.location.accepted', event);
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

  private extractTrackingToken(client: AuthenticatedSocket) {
    const trackingToken = client.handshake.auth?.trackingToken;
    return typeof trackingToken === 'string' && trackingToken.trim()
      ? trackingToken.trim()
      : undefined;
  }
}
