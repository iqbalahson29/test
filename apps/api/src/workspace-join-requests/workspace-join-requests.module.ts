import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkspaceJoinRequestsController } from './workspace-join-requests.controller';
import { WorkspaceJoinRequestsService } from './workspace-join-requests.service';

@Module({
  imports: [AuditLogModule, NotificationsModule],
  controllers: [WorkspaceJoinRequestsController],
  providers: [WorkspaceJoinRequestsService],
})
export class WorkspaceJoinRequestsModule {}
