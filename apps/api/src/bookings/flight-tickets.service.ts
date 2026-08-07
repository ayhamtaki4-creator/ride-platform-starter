import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { MediaService, UploadedMediaFile } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { FlightTicketExtractorService } from './flight-ticket-extractor.service';

type FlightPolicyRow = { flightTimeMode: 'ARRIVAL' | 'DEPARTURE' };

@Injectable()
export class FlightTicketsService {
  constructor(
    private readonly media: MediaService,
    private readonly prisma: PrismaService,
    private readonly extractor: FlightTicketExtractorService
  ) {}

  async uploadAndExtract(
    user: AuthUser,
    file: UploadedMediaFile | undefined,
    routeId?: string
  ) {
    const route = routeId
      ? await this.prisma.serviceRoute.findUnique({
          where: { id: routeId },
          include: { origin: true, destination: true }
        })
      : null;
    const routeContext = route
      ? `${route.nameAr}: ${route.origin.nameAr} to ${route.destination.nameAr}`
      : undefined;
    const policyRows = routeId
      ? await this.prisma.$queryRaw<FlightPolicyRow[]>(Prisma.sql`
          SELECT "flightTimeMode"
          FROM "RouteBookingPolicy"
          WHERE "routeId" = ${routeId}::uuid
          LIMIT 1
        `).catch(() => [] as FlightPolicyRow[])
      : [];
    const flightTimeMode =
      policyRows[0]?.flightTimeMode ??
      (route?.destination.type === 'AIRPORT' ? 'DEPARTURE' : 'ARRIVAL');

    const asset = await this.media.upload(user, file, {
      purpose: 'FLIGHT_TICKET',
      visibility: 'PRIVATE'
    });
    const extraction = await this.extractor.extract(file!, routeContext, flightTimeMode);
    await this.media.updateMetadata(
      asset.id,
      extraction as unknown as Prisma.InputJsonValue
    );

    return {
      asset: {
        id: asset.id,
        originalName: asset.originalName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes
      },
      extraction
    };
  }
}
