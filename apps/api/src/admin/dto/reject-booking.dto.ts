import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectBookingDto {
  @ApiPropertyOptional({ example: 'تعذر تأمين الرحلة في التاريخ المطلوب' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
