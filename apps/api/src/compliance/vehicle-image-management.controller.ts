import { Controller, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { VehicleImageManagementService } from './vehicle-image-management.service';

@ApiTags('Administration - Fleet Images')
@ApiBearerAuth()
@Controller('admin/drivers/:driverId/vehicles/:vehicleId/media-images')
export class VehicleImageManagementController {
  constructor(private readonly images: VehicleImageManagementService) {}

  @Permissions('compliance:manage')
  @Patch(':imageId/primary')
  setPrimary(
    @CurrentUser() actor: AuthUser,
    @Param('driverId') driverId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('imageId') imageId: string
  ) {
    return this.images.setPrimary(actor, driverId, vehicleId, imageId);
  }
}
