import { BookingReviewStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminBookingsQueryDto {
  @IsOptional()
  @IsEnum(BookingReviewStatus)
  status?: BookingReviewStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
