import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { PracticeQuizzesModule } from './practice-quizzes/practice-quizzes.module';
import { PracticeQuestionsModule } from './practice-questions/questions.module';
import { PracticeAssignmentsModule } from './practice-assignments/practice-assignments.module';
import { PracticeAttemptsModule } from './practice-attempts/practice-attempts.module';
import { PracticeGradingModule } from './practice-grading/practice-grading.module';
import { PracticeAnalyticsModule } from './practice-analytics/practice-analytics.module';
import { TenantRequestsModule } from './tenant-requests/tenant-requests.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { WorkspaceJoinRequestsModule } from './workspace-join-requests/workspace-join-requests.module';
import { MemberInvitationsModule } from './member-invitations/member-invitations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SearchModule } from './search/search.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Global default: 200 req/min per IP, generous enough for normal use
    // (polling, notifications, autosave) while blocking abusive bursts.
    // Individual routes (e.g. login) tighten this with @Throttle(...).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    TenantRequestsModule,
    TenantsModule,
    UsersModule,
    MembershipsModule,
    QuizzesModule,
    QuestionsModule,
    GroupsModule,
    AssignmentsModule,
    AttemptsModule,
    GradingModule,
    AnalyticsModule,
    PracticeQuizzesModule,
    PracticeQuestionsModule,
    PracticeAssignmentsModule,
    PracticeAttemptsModule,
    PracticeGradingModule,
    PracticeAnalyticsModule,
    WorkspaceJoinRequestsModule,
    MemberInvitationsModule,
    DashboardModule,
    SearchModule,
    NotificationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
