import { BookingReviewStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const ADMIN_BOOKING_ATTENTION_FILTERS = [
  'REVIEW_OVER_30M',
  'REVIEW_OVER_24H',
  'DRIVER_UNASSIGNED',
  'DRIVER_OVER_30M'
] as const;

export type AdminBookingAttentionFilter = (typeof ADMIN_BOOKING_ATTENTION_FILTERS)[number];

export class AdminBookingsQueryDto {
  @IsOptional()
  @IsIn([...ADMIN_BOOKING_ATTENTION_FILTERS])
  attention?: AdminBookingAttentionFilter;

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
