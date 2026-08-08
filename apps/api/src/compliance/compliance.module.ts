import { Global, Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { VehicleImageManagementController } from './vehicle-image-management.controller';
import { VehicleImageManagementService } from './vehicle-image-management.service';

@Global()
@Module({
  imports: [MediaModule],
  controllers: [ComplianceController, VehicleImageManagementController],
  providers: [ComplianceService, VehicleImageManagementService],
  exports: [ComplianceService]
})
export class ComplianceModule {}
