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
import { LocationIngressThrottleService } from '../tracking/location-ingress-throttle.service';
import { TrackingService } from '../tracking/tracking.service';
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
    private readonly events: RealtimeEventsService,
    private readonly locationThrottle: LocationIngressThrottleService,
    private readonly tracking: TrackingService
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

    const throttleDecision = this.locationThrottle.check(user.sub, tripId);
    if (throttleDecision.throttled) {
      client.emit('trip.location.accepted', {
        tripId,
        driverId: user.sub,
        recordedAt: payload.recordedAt ?? new Date().toISOString(),
        throttled: true,
        retryAfterMs: throttleDecision.retryAfterMs
      });
      return;
    }

    try {
      const location = await this.tracking.updateDriverLocation(user, tripId, {
        latitude,
        longitude,
        accuracy: payload.accuracy,
        heading: payload.heading,
        speed: payload.speed,
        recordedAt: payload.recordedAt
      });

      this.locationThrottle.markAccepted(user.sub, tripId);

      const event = {
        ...location,
        throttled: false,
        retryAfterMs: 0
      };

      if (location.accepted) {
        const trip = await this.prisma.trip.findUnique({
          where: { id: tripId },
          select: { passengerId: true }
        });

        this.server.to(`trip:${tripId}`).emit('trip.location.updated', event);
        this.server.to(`public-trip:${tripId}`).emit('trip.location.updated', event);
        if (trip?.passengerId) {
          this.server.to(`user:${trip.passengerId}`).emit('trip.location.updated', event);
        }
        this.server.to('role:dispatch').emit('trip.location.updated', event);
      }

      client.emit('trip.location.accepted', event);
    } catch (caught) {
      const message =
        caught instanceof Error && caught.message
          ? caught.message
          : 'تعذر تحديث موقع الرحلة.';
      throw new WsException(message);
    }
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
