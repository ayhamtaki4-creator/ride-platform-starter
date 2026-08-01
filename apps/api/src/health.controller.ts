import { Controller, Get } from '@nestjs/common';
import { Public } from './iam/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'ride-platform-api',
      timestamp: new Date().toISOString()
    };
  }
}
