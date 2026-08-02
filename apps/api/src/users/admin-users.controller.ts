import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { UsersService } from './users.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@ApiTags('Administration - Users')
@ApiBearerAuth()
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Permissions('user:read:any')
  @Get()
  list() {
    return this.users.list();
  }

  @Permissions('user:read:any')
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.users.detail(id);
  }

  @Permissions('user:update:any')
  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateAdminUserDto) {
    return this.users.create(actor, dto);
  }

  @Permissions('user:update:any')
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto
  ) {
    return this.users.update(actor, id, dto);
  }

  @Permissions('user:update:any')
  @Post(':id/suspend')
  suspend(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.users.setStatus(actor, id, 'SUSPENDED');
  }

  @Permissions('user:update:any')
  @Post(':id/activate')
  activate(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.users.setStatus(actor, id, 'ACTIVE');
  }

  @Permissions('user:update:any')
  @Post(':id/reset-password')
  resetPassword(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto
  ) {
    return this.users.resetPassword(actor, id, dto.password);
  }
}
