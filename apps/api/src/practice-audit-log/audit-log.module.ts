import { Module } from '@nestjs/common';
import { PracticeAuditLogController } from './audit-log.controller';
import { PracticeAuditLogService } from './audit-log.service';

@Module({
  controllers: [PracticeAuditLogController],
  providers: [PracticeAuditLogService],
  exports: [PracticeAuditLogService],
})
export class PracticeAuditLogModule {}
