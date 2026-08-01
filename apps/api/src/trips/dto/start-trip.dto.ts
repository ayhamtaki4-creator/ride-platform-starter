import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class StartTripDto {
  @ApiProperty({ example: '4217' })
  @IsString()
  @Length(4, 4)
  pin!: string;
}
