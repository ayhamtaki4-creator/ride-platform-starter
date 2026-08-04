import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'rider@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongPassword123!' })
  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور مطلوبة.' })
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
