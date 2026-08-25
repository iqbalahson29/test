import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AccessTokenPayload } from '../auth/token.types';
import { GradeResponseDto } from './dto/grade-response.dto';
import { GradingService } from './grading.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class GradingController {
  constructor(private readonly grading: GradingService) {}

  @Get('quizzes/:quizId/grading-queue')
  gradingQueue(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
  ) {
    return this.grading.gradingQueue(user.tenantId, quizId);
  }

  @Post('responses/:id/grade')
  gradeResponse(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: GradeResponseDto,
  ) {
    return this.grading.gradeResponse(user.tenantId, id, user.membershipId, dto);
  }

  @Get('responses/:id/download-url')
  getDownloadUrl(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.grading.getDownloadUrl(user.tenantId, id);
  }
}
