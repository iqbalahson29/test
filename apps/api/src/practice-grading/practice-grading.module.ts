import { Module } from '@nestjs/common';
import { PracticeAuditLogModule } from '../practice-audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { PracticeGradingController } from './practice-grading.controller';
import { PracticeGradingService } from './practice-grading.service';

@Module({
  imports: [StorageModule, PracticeAuditLogModule, NotificationsModule],
  controllers: [PracticeGradingController],
  providers: [PracticeGradingService],
  exports: [PracticeGradingService],
})
export class PracticeGradingModule {}
