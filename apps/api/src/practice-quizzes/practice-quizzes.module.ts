import { Module } from '@nestjs/common';
import { PracticeAuditLogModule } from '../practice-audit-log/audit-log.module';
import { StorageModule } from '../storage/storage.module';
import { PracticeQuizzesController } from './practice-quizzes.controller';
import { PracticeQuizzesService } from './practice-quizzes.service';
import { PracticeQuizSchedulerService } from './practice-quiz-scheduler.service';

@Module({
  imports: [PracticeAuditLogModule, StorageModule],
  controllers: [PracticeQuizzesController],
  providers: [PracticeQuizzesService, PracticeQuizSchedulerService],
  exports: [PracticeQuizzesService],
})
export class PracticeQuizzesModule {}
