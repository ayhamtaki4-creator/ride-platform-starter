import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../iam/auth-user.type';
import { MediaService, UploadedMediaFile } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { FlightTicketExtractorService } from './flight-ticket-extractor.service';

type FlightPolicyRow = { flightTimeMode: 'ARRIVAL' | 'DEPARTURE' };

type TicketContext = {
  routeContext?: string;
  flightTimeMode: 'ARRIVAL' | 'DEPARTURE';
};

@Injectable()
export class FlightTicketsService {
  constructor(
    private readonly media: MediaService,
    private readonly prisma: PrismaService,
    private readonly extractor: FlightTicketExtractorService
  ) {}

  async analyze(file: UploadedMediaFile | undefined, routeId?: string) {
    this.assertTicketFile(file);
    const context = await this.resolveContext(routeId);
    return {
      extraction: await this.extractor.extract(
        file!,
        context.routeContext,
        context.flightTimeMode
      )
    };
  }

  async uploadAndExtract(
    user: AuthUser,
    file: UploadedMediaFile | undefined,
    routeId?: string
  ) {
    this.assertTicketFile(file);
    const context = await this.resolveContext(routeId);
    const asset = await this.media.upload(user, file, {
      purpose: 'FLIGHT_TICKET',
      visibility: 'PRIVATE'
    });
    const extraction = await this.extractor.extract(
      file!,
      context.routeContext,
      context.flightTimeMode
    );
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

  private async resolveContext(routeId?: string): Promise<TicketContext> {
    if (routeId && !this.isUuid(routeId)) {
      throw new BadRequestException('معرف المسار غير صالح.');
    }

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

    return { routeContext, flightTimeMode };
  }

  private assertTicketFile(file: UploadedMediaFile | undefined) {
    if (!file) throw new BadRequestException('اختر ملف تذكرة الطيران أولًا.');
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('حجم تذكرة الطيران يجب ألا يتجاوز 10 ميغابايت.');
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype)) {
      throw new BadRequestException('صيغة التذكرة غير مدعومة. استخدم JPG أو PNG أو WEBP أو PDF.');
    }
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
