import { PaymentReceiver } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateCashPaymentDto {
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  amountPaid!: number;

  @IsEnum(PaymentReceiver)
  receiver!: PaymentReceiver;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
