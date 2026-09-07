import { Module } from '@nestjs/common';
import { PracticeAuditLogModule } from '../practice-audit-log/audit-log.module';
import { PracticeGradingModule } from '../practice-grading/practice-grading.module';
import { StorageModule } from '../storage/storage.module';
import { PracticeQuestionsController } from './questions.controller';
import { PracticeQuestionsService } from './questions.service';

@Module({
  imports: [PracticeAuditLogModule, PracticeGradingModule, StorageModule],
  controllers: [PracticeQuestionsController],
  providers: [PracticeQuestionsService],
})
export class PracticeQuestionsModule {}
