import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateDriverContactDto {
  @ApiProperty({ description: 'رقم الهاتف الدولي المستخدم للتواصل عبر WhatsApp', minLength: 7 })
  @IsString()
  @MinLength(7)
  @MaxLength(40)
  phone!: string;
}
