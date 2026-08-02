import { Module } from '@nestjs/common';
import { AdminRoutesController } from './admin-routes.controller';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';

@Module({
  controllers: [RoutesController, AdminRoutesController],
  providers: [RoutesService],
  exports: [RoutesService]
})
export class RoutesModule {}
