import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ClaimGuestBookingDto {
  @ApiProperty({
    format: 'uuid',
    description: 'الرمز الخاص الذي تم إنشاؤه عند حجز الرحلة كضيف (لا يكفي رقم الهاتف أو رقم الحجز وحدهما)'
  })
  @IsUUID('4')
  clientRequestId!: string;
}
