import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsString,
  MaxLength,
  MinLength
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'rider@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongPassword123!' })
  @IsString()
  @MinLength(10)
  password!: string;

  @ApiProperty({ example: 'Ali' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Hassan' })
  @IsString()
  lastName!: string;

  @ApiProperty({ example: '+963944000000' })
  @IsString()
  @MaxLength(40)
  phone!: string;

  @ApiProperty({ default: true })
  @IsBoolean()
  whatsappOptIn!: boolean;
}
