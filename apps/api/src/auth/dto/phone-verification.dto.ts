import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class PhoneVerificationRequestDto {
  @ApiProperty({ example: '+963944000000' })
  @IsString()
  @MaxLength(30)
  phone!: string;
}

export class PhoneVerificationConfirmDto extends PhoneVerificationRequestDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  newPassword!: string;
}
