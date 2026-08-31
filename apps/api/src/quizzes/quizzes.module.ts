import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';
import { QuizSchedulerService } from './quiz-scheduler.service';

@Module({
  imports: [AuditLogModule],
  controllers: [QuizzesController],
  providers: [QuizzesService, QuizSchedulerService],
  exports: [QuizzesService],
})
export class QuizzesModule {}
