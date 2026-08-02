import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingDirection, BookingType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsUUID, Max, Min, ValidateIf } from 'class-validator';

export class BookingQuoteDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'المسار الديناميكي المفضل' })
  @ValidateIf((dto: BookingQuoteDto) => !dto.direction)
  @IsUUID()
  routeId?: string;

  @ApiPropertyOptional({ enum: BookingDirection, description: 'للتوافق مع نموذج الحجز القديم' })
  @ValidateIf((dto: BookingQuoteDto) => !dto.routeId)
  @IsEnum(BookingDirection)
  direction?: BookingDirection;

  @ApiProperty({ enum: BookingType })
  @IsEnum(BookingType)
  bookingType!: BookingType;

  @ApiProperty({ example: 1, minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  passengerCount!: number;
}
