import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PracticeAnalyticsService } from './practice-analytics.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AccessTokenPayload } from '../auth/token.types';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PracticeAnalyticsController {
  constructor(private readonly analytics: PracticeAnalyticsService) {}

  @Get('practice-quizzes/:quizId/analytics')
  @Roles(Role.ADMIN)
  quizAnalytics(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
  ) {
    return this.analytics.quizAnalytics(user.tenantId, quizId);
  }

  @Get('students/me/practice-analytics')
  @Roles(Role.STUDENT)
  myAnalytics(@CurrentUser() user: AccessTokenPayload) {
    return this.analytics.myAnalytics(user.tenantId, user.membershipId);
  }
}
