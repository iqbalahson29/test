import { Module } from '@nestjs/common';
import { TenantRequestsController } from './tenant-requests.controller';
import { TenantRequestsService } from './tenant-requests.service';

@Module({
  controllers: [TenantRequestsController],
  providers: [TenantRequestsService],
})
export class TenantRequestsModule {}
