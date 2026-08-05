import { Global, Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [MediaModule, PrismaModule, ConfigModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService]
})
export class ComplianceModule {}
