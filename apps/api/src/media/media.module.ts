import { Global, Module } from '@nestjs/common';
import { MediaBrandingController } from './media-branding.controller';
import { MediaBrandingService } from './media-branding.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { PublicMediaDeliveryService } from './public-media-delivery.service';
import { R2ObjectStorageService } from './r2-object-storage.service';

@Global()
@Module({
  controllers: [MediaController, MediaBrandingController],
  providers: [
    MediaService,
    R2ObjectStorageService,
    PublicMediaDeliveryService,
    MediaBrandingService
  ],
  exports: [MediaService, R2ObjectStorageService, PublicMediaDeliveryService, MediaBrandingService]
})
export class MediaModule {}
