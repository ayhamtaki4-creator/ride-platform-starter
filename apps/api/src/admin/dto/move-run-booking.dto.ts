import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MoveRunBookingDto {
  @ApiProperty()
  @IsUUID()
  targetRunId!: string;
}
