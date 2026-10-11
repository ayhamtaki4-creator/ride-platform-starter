import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: '+963944000000', description: 'البريد الإلكتروني أو رقم الهاتف الدولي' })
  @IsString()
  @MinLength(5)
  email!: string;

  @ApiProperty({ example: 'ChangeMe123!' })
  @IsString()
  password!: string;
}
