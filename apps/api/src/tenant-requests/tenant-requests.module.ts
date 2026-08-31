import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TenantRequestsController } from './tenant-requests.controller';
import { TenantRequestsService } from './tenant-requests.service';

@Module({
  imports: [NotificationsModule],
  controllers: [TenantRequestsController],
  providers: [TenantRequestsService],
})
export class TenantRequestsModule {}
