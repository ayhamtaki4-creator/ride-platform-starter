import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { Public } from '../iam/public.decorator';
import { UpdateRouteBookingPolicyDto } from './dto/update-route-booking-policy.dto';
import { RouteBookingPoliciesService } from './route-booking-policies.service';

@ApiTags('Route booking policies')
@Controller('route-booking-policies')
export class RouteBookingPoliciesController {
  constructor(private readonly policies: RouteBookingPoliciesService) {}

  @Public()
  @Get()
  list() {
    return this.policies.publicList();
  }
}

@ApiTags('Administration - Route booking policies')
@ApiBearerAuth()
@Controller('admin/route-booking-policies')
export class AdminRouteBookingPoliciesController {
  constructor(private readonly policies: RouteBookingPoliciesService) {}

  @Permissions('route:manage')
  @Get()
  list() {
    return this.policies.adminList();
  }

  @Permissions('route:manage')
  @Patch(':routeId')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('routeId') routeId: string,
    @Body() dto: UpdateRouteBookingPolicyDto
  ) {
    return this.policies.update(actor, routeId, dto);
  }
}
