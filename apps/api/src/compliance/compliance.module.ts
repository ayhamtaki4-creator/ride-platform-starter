import { Global, Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';

@Global()
@Module({
  imports: [MediaModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService]
})
export class ComplianceModule {}
