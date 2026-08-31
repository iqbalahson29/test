import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QuizzesService } from './quizzes.service';

/** Promotes SCHEDULED quizzes to PUBLISHED once their availableFrom time arrives. */
@Injectable()
export class QuizSchedulerService {
  private readonly logger = new Logger(QuizSchedulerService.name);

  constructor(private readonly quizzes: QuizzesService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async promoteDueQuizzes() {
    const count = await this.quizzes.publishDueScheduledQuizzes();
    if (count > 0) {
      this.logger.log(`Published ${count} scheduled quiz(es)`);
    }
  }
}
