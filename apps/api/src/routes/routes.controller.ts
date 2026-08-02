import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../iam/public.decorator';
import { RoutesService } from './routes.service';

@ApiTags('Service Routes')
@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Public()
  @Get()
  list() {
    return this.routes.publicList();
  }

  @Public()
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.routes.publicDetail(id);
  }
}
