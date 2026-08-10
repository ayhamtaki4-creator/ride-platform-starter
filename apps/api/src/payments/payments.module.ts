import { Module } from '@nestjs/common';
import {
  AdminPaymentsController,
  DriverPaymentsController
} from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [AdminPaymentsController, DriverPaymentsController],
  providers: [PaymentsService]
})
export class PaymentsModule {}
