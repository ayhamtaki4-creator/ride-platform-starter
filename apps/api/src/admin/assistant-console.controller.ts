import {
  Body, Controller, ForbiddenException, Get, Ip, Patch, Post
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../iam/auth-user.type';
import { CurrentUser } from '../iam/current-user.decorator';
import { Permissions } from '../iam/permissions.decorator';
import { Public } from '../iam/public.decorator';
import { AssistantConsoleService } from './assistant-console.service';
import { AssistantMetricDto, SaveAssistantConfigurationDto } from './dto/assistant-console.dto';

@ApiTags('Public Assistant')
@Controller('assistant')
export class PublicAssistantController {
  constructor(private readonly assistant: AssistantConsoleService) {}

  @Public()
  @Get('config')
  publicConfig() {
    return this.assistant.publicConfig();
  }

  @Public()
  @Post('metric')
  async metric(@Ip() ip: string | undefined, @Body() dto: AssistantMetricDto) {
    return this.assistant.recordEvent(ip, dto.event, dto.topic);
  }
}

@ApiTags('Admin - Assistant')
@ApiBearerAuth()
@Controller('admin/assistant')
export class AdminAssistantController {
  constructor(private readonly assistant: AssistantConsoleService) {}

  @Permissions('booking:read:any')
  @Get('config')
  config() {
    return this.assistant.publicConfig();
  }

  @Permissions('booking:update:any')
  @Patch('config')
  save(@CurrentUser() user: AuthUser, @Body() dto: SaveAssistantConfigurationDto) {
    if (!user.roles.some((role) => role === 'SUPER_ADMIN' || role === 'ADMIN')) {
      throw new ForbiddenException('هذه الإعدادات متاحة لمدير المنصة فقط.');
    }
    return this.assistant.saveConfig(user.sub, dto);
  }

  @Permissions('booking:read:any')
  @Get('metrics')
  metrics() {
    return this.assistant.metrics();
  }
}
