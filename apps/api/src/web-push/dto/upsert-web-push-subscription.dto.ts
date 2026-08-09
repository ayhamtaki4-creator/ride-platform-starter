import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';

export class UpsertWebPushSubscriptionDto {
  @IsUrl({
    protocols: ['https'],
    require_protocol: true
  })
  @MaxLength(4096)
  endpoint!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(512)
  @Matches(/^[A-Za-z0-9_-]+$/)
  p256dh!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  @Matches(/^[A-Za-z0-9_-]+$/)
  auth!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expirationTime?: number | null;
}

export class RemoveWebPushSubscriptionDto {
  @IsUrl({
    protocols: ['https'],
    require_protocol: true
  })
  @MaxLength(4096)
  endpoint!: string;
}
