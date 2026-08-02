import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectAssignmentDto {
  @ApiProperty({ example: 'لدي موعد آخر في هذا التوقيت' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
