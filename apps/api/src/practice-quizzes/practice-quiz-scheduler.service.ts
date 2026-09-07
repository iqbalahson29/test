import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PracticeQuizzesService } from './practice-quizzes.service';

/** Promotes SCHEDULED practice quizzes to PUBLISHED once their availableFrom time arrives. */
@Injectable()
export class PracticeQuizSchedulerService {
  private readonly logger = new Logger(PracticeQuizSchedulerService.name);

  constructor(private readonly practiceQuizzes: PracticeQuizzesService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async promoteDueQuizzes() {
    const count = await this.practiceQuizzes.publishDueScheduledQuizzes();
    if (count > 0) {
      this.logger.log(`Published ${count} scheduled practice quiz(es)`);
    }
  }
}
