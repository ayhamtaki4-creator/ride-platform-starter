import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { UpdateMediaBrandingDto } from './dto/update-media-branding.dto';
import { MediaBrandingService } from './media-branding.service';

@ApiTags('Administration - Media branding')
@ApiBearerAuth()
@Controller('admin/media-branding')
export class MediaBrandingController {
  constructor(private readonly branding: MediaBrandingService) {}

  @Permissions('media:manage')
  @Get()
  get() {
    return this.branding.get();
  }

  @Permissions('media:manage')
  @Patch()
  update(@CurrentUser() actor: AuthUser, @Body() dto: UpdateMediaBrandingDto) {
    return this.branding.update(actor, dto);
  }
}
