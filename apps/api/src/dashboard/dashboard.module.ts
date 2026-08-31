import { Module } from '@nestjs/common';
import { QuizzesModule } from '../quizzes/quizzes.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [QuizzesModule, AssignmentsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
