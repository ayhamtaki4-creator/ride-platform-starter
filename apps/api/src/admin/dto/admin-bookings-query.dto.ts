import { BookingReviewStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminBookingsQueryDto {
  @IsOptional()
  @IsEnum(BookingReviewStatus)
  status?: BookingReviewStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  history?: 'true' | 'false';
}
