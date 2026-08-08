import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateDriverContactDto {
  @ApiProperty({ description: 'رقم الهاتف الدولي المستخدم للتواصل عبر WhatsApp' })
  @IsString()
  @MaxLength(40)
  phone!: string;
}
