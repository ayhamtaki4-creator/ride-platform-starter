import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../iam/public.decorator';
import { RouteTemplatesService } from './route-templates.service';
import { RoutesService } from './routes.service';

@ApiTags('Service Routes')
@Controller('routes')
export class RoutesController {
  constructor(
    private readonly routes: RoutesService,
    private readonly templates: RouteTemplatesService
  ) {}

  @Public()
  @Get()
  async list() {
    const [routes, templates] = await Promise.all([
      this.routes.publicList(),
      this.templates.publicList().catch(() => [])
    ]);
    const byRoute = new Map(templates.map((template) => [template.routeId, template]));
    return routes
      .map((route) => this.privateCarOnly(route))
      .filter((route) => route.bookable)
      .map((route) => this.withSavedEndpoints(route, byRoute.get(route.id)));
  }

  @Public()
  @Get(':id')
  async detail(@Param('id') id: string) {
    const route = this.privateCarOnly(await this.routes.publicDetail(id));
    const template = await this.templates.publicGet(id).catch(() => null);
    return this.withSavedEndpoints(route, template);
  }

  private privateCarOnly<TRoute extends {
    pricingRules: Array<{ bookingType: string }>;
    bookingTypes: string[];
    bookable: boolean;
  }>(route: TRoute) {
    const pricingRules = route.pricingRules.filter(
      (rule) => rule.bookingType === 'PRIVATE_CAR'
    );
    return {
      ...route,
      pricingRules,
      bookingTypes: pricingRules.length > 0 ? ['PRIVATE_CAR'] : [],
      bookable: pricingRules.length > 0
    };
  }

  private withSavedEndpoints<TRoute extends {
    id: string;
    origin: Record<string, unknown>;
    destination: Record<string, unknown>;
  }>(route: TRoute, template?: {
    originAddress: string;
    originLatitude: number;
    originLongitude: number;
    destinationAddress: string;
    destinationLatitude: number;
    destinationLongitude: number;
  } | null) {
    if (!template) return route;
    return {
      ...route,
      origin: {
        ...route.origin,
        nameAr: template.originAddress,
        latitude: template.originLatitude,
        longitude: template.originLongitude
      },
      destination: {
        ...route.destination,
        nameAr: template.destinationAddress,
        latitude: template.destinationLatitude,
        longitude: template.destinationLongitude
      }
    };
  }
}
