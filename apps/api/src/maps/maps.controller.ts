import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Public } from '../iam/public.decorator';
import { MapsService } from './maps.service';

@Public()
@Controller('maps')
export class MapsController {
  constructor(private readonly maps: MapsService) {}

  @Get('geocode/search')
  search(@Query('query') rawQuery?: string, @Query('limit') rawLimit?: string) {
    const query = rawQuery?.trim() ?? '';
    if (query.length < 2 || query.length > 160) {
      throw new BadRequestException('اكتب اسم موقع بين محرفين و160 محرفًا.');
    }

    const parsedLimit = rawLimit == null ? 6 : Number.parseInt(rawLimit, 10);
    const limit = Number.isInteger(parsedLimit)
      ? Math.min(8, Math.max(1, parsedLimit))
      : 6;

    return this.maps.search(query, limit);
  }

  @Get('geocode/reverse')
  reverse(
    @Query('latitude') rawLatitude?: string,
    @Query('longitude') rawLongitude?: string
  ) {
    const { latitude, longitude } = this.coordinates(
      rawLatitude,
      rawLongitude
    );
    return this.maps.reverse(latitude, longitude);
  }

  @Get('route')
  route(
    @Query('pickupLatitude') rawPickupLatitude?: string,
    @Query('pickupLongitude') rawPickupLongitude?: string,
    @Query('dropoffLatitude') rawDropoffLatitude?: string,
    @Query('dropoffLongitude') rawDropoffLongitude?: string
  ) {
    const pickup = this.coordinates(rawPickupLatitude, rawPickupLongitude);
    const dropoff = this.coordinates(rawDropoffLatitude, rawDropoffLongitude);
    return this.maps.route(
      pickup.latitude,
      pickup.longitude,
      dropoff.latitude,
      dropoff.longitude
    );
  }

  private coordinates(rawLatitude?: string, rawLongitude?: string) {
    const latitude = Number(rawLatitude);
    const longitude = Number(rawLongitude);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      throw new BadRequestException('إحداثيات الموقع غير صحيحة.');
    }
    return { latitude, longitude };
  }
}
