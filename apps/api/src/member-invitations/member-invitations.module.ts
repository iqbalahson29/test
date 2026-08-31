import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MemberInvitationsController } from './member-invitations.controller';
import { MemberInvitationsService } from './member-invitations.service';

@Module({
  imports: [AuditLogModule, NotificationsModule],
  controllers: [MemberInvitationsController],
  providers: [MemberInvitationsService],
})
export class MemberInvitationsModule {}
