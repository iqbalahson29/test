import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AccessTokenPayload } from '../auth/token.types';
import { GradePracticeResponseDto } from './dto/grade-practice-response.dto';
import { PracticeGradingService } from './practice-grading.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PracticeGradingController {
  constructor(private readonly grading: PracticeGradingService) {}

  @Get('practice-quizzes/:quizId/grading-queue')
  gradingQueue(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
  ) {
    return this.grading.gradingQueue(user.tenantId, quizId);
  }

  @Post('practice-quizzes/:quizId/questions/:questionId/regrade')
  regradeQuestion(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
    @Param('questionId') questionId: string,
  ) {
    return this.grading.regradeQuestion(
      user.tenantId,
      quizId,
      questionId,
      user.membershipId,
    );
  }

  @Post('practice-quizzes/:quizId/regrade')
  regradeQuiz(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
  ) {
    return this.grading.regradeQuiz(user.tenantId, quizId, user.membershipId);
  }

  @Post('practice-responses/:id/grade')
  gradeResponse(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: GradePracticeResponseDto,
  ) {
    return this.grading.gradeResponse(user.tenantId, id, user.membershipId, dto);
  }

  @Get('practice-responses/:id/download-url')
  getDownloadUrl(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.grading.getDownloadUrl(user.tenantId, id);
  }
}
