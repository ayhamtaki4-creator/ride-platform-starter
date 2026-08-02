import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query
} from '@nestjs/common';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string
  ) {
    return this.notifications.list(user, limit, cursor);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string
  ) {
    return this.notifications.markRead(user, id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string
  ) {
    return this.notifications.remove(user, id);
  }
}
