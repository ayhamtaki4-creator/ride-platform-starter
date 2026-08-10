import { Module } from '@nestjs/common';
import {
  AdminDriverFinanceController,
  AdminPaymentsController,
  DriverFinanceController,
  DriverPaymentsController
} from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [
    AdminPaymentsController,
    AdminDriverFinanceController,
    DriverPaymentsController,
    DriverFinanceController
  ],
  providers: [PaymentsService]
})
export class PaymentsModule {}
