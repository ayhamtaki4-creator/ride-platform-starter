import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { Public } from '../iam/public.decorator';
import { UpdateHomeShowcaseItemDto } from './dto/update-home-showcase-item.dto';
import { HomeShowcaseService } from './home-showcase.service';

@ApiTags('Homepage')
@Controller()
export class HomeShowcaseController {
  constructor(private readonly showcase: HomeShowcaseService) {}

  @Public()
  @Get('home/showcase')
  listPublic() {
    return this.showcase.publicList();
  }

  @ApiTags('Administration - Homepage')
  @ApiBearerAuth()
  @Permissions('media:manage')
  @Get('admin/home-showcase')
  listAdmin() {
    return this.showcase.adminList();
  }

  @ApiTags('Administration - Homepage')
  @ApiBearerAuth()
  @Permissions('media:manage')
  @Post('admin/home-showcase/:id')
  attach(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateHomeShowcaseItemDto
  ) {
    return this.showcase.attach(actor, id, dto);
  }

  @ApiTags('Administration - Homepage')
  @ApiBearerAuth()
  @Permissions('media:manage')
  @Patch('admin/home-showcase/:id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateHomeShowcaseItemDto
  ) {
    return this.showcase.update(actor, id, dto);
  }
}
