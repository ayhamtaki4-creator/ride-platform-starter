import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiTags
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { Public } from '../iam/public.decorator';
import { RejectMediaDto } from './dto/reject-media.dto';
import { UploadMediaDto } from './dto/upload-media.dto';
import { MediaService, UploadedMediaFile } from './media.service';
import { PublicMediaDeliveryService } from './public-media-delivery.service';

@ApiTags('Media')
@Controller()
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly publicDelivery: PublicMediaDeliveryService
  ) {}

  @Public()
  @Get('media/public/:id')
  async publicFile(
    @Param('id') id: string,
    @Query('variant') variant: string | undefined,
    @Res() response: Response
  ) {
    const delivery = await this.publicDelivery.resolve(id, variant);

    if (delivery.kind === 'redirect') {
      response.set({
        Location: delivery.url,
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60'
      });
      response.status(302).end();
      return;
    }

    const file = delivery.file;
    response.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.sizeBytes),
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName)}"`,
      'Cache-Control': 'public, max-age=86400, immutable'
    });
    file.stream.pipe(response);
  }

  @ApiTags('Administration - Media')
  @ApiBearerAuth()
  @Permissions('media:manage')
  @Get('admin/media')
  list(@Query('status') status?: string, @Query('purpose') purpose?: string) {
    return this.media.list(status, purpose);
  }

  @ApiTags('Administration - Media')
  @ApiBearerAuth()
  @Permissions('media:manage')
  @Post('admin/media/upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'purpose'],
      properties: {
        file: { type: 'string', format: 'binary' },
        purpose: {
          type: 'string',
          enum: [
            'DRIVER_AVATAR',
            'VEHICLE_IMAGE',
            'DRIVER_DOCUMENT',
            'VEHICLE_DOCUMENT',
            'FLIGHT_TICKET',
            'OTHER'
          ]
        },
        visibility: { type: 'string', enum: ['PUBLIC', 'PRIVATE'] },
        variantKind: { type: 'string', enum: ['ORIGINAL', 'DISPLAY', 'THUMBNAIL'] },
        variantOfId: { type: 'string', format: 'uuid' }
      }
    }
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024, files: 1 }
    })
  )
  upload(
    @CurrentUser() actor: AuthUser,
    @UploadedFile() file: UploadedMediaFile | undefined,
    @Body() dto: UploadMediaDto
  ) {
    return this.media.upload(actor, file, dto);
  }

  @ApiTags('Administration - Media')
  @ApiBearerAuth()
  @Permissions('media:manage')
  @Get('admin/media/:id/file')
  async adminFile(@Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    const file = await this.media.adminFile(id);
    response.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.sizeBytes),
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName)}"`,
      'Cache-Control': 'private, no-store'
    });
    return new StreamableFile(file.stream);
  }

  @ApiTags('Administration - Media')
  @ApiBearerAuth()
  @Permissions('media:manage')
  @Post('admin/media/:id/approve')
  approve(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.media.approve(actor, id);
  }

  @ApiTags('Administration - Media')
  @ApiBearerAuth()
  @Permissions('media:manage')
  @Post('admin/media/:id/reject')
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectMediaDto
  ) {
    return this.media.reject(actor, id, dto.reason);
  }

  @ApiTags('Administration - Media')
  @ApiBearerAuth()
  @Permissions('media:manage')
  @Delete('admin/media/:id')
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.media.remove(actor, id);
  }
}
