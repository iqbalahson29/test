import { Module } from '@nestjs/common';
import { PracticeAuditLogModule } from '../practice-audit-log/audit-log.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PracticeAssignmentsController } from './practice-assignments.controller';
import { PracticeAssignmentsService } from './practice-assignments.service';

@Module({
  imports: [MembershipsModule, PracticeAuditLogModule, NotificationsModule],
  controllers: [PracticeAssignmentsController],
  providers: [PracticeAssignmentsService],
  exports: [PracticeAssignmentsService],
})
export class PracticeAssignmentsModule {}
