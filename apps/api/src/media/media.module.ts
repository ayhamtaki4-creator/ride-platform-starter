import { Global, Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { R2ObjectStorageService } from './r2-object-storage.service';

@Global()
@Module({
  controllers: [MediaController],
  providers: [MediaService, R2ObjectStorageService],
  exports: [MediaService, R2ObjectStorageService]
})
export class MediaModule {}
