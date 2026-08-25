import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { MembershipsModule } from './memberships/memberships.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { QuestionsModule } from './questions/questions.module';
import { GroupsModule } from './groups/groups.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { AttemptsModule } from './attempts/attempts.module';
import { GradingModule } from './grading/grading.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { TenantRequestsModule } from './tenant-requests/tenant-requests.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    TenantRequestsModule,
    MembershipsModule,
    QuizzesModule,
    QuestionsModule,
    GroupsModule,
    AssignmentsModule,
    AttemptsModule,
    GradingModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
