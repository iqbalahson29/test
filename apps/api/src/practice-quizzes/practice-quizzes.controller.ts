import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PracticeAuditLogService } from '../practice-audit-log/audit-log.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AccessTokenPayload } from '../auth/token.types';
import { CreatePracticeQuizDto } from './dto/create-practice-quiz.dto';
import { UpdatePracticeQuizDto } from './dto/update-practice-quiz.dto';
import { UpdatePracticeQuizStatusDto } from './dto/update-practice-quiz-status.dto';
import { PracticeQuizzesService } from './practice-quizzes.service';

@Controller('practice-quizzes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PracticeQuizzesController {
  constructor(
    private readonly practiceQuizzes: PracticeQuizzesService,
    private readonly auditLog: PracticeAuditLogService,
  ) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.practiceQuizzes.list(user.tenantId);
  }

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreatePracticeQuizDto) {
    return this.practiceQuizzes.create(user.tenantId, user.membershipId, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.practiceQuizzes.findOne(user.tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePracticeQuizDto,
  ) {
    return this.practiceQuizzes.update(user.tenantId, id, dto, user.membershipId);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePracticeQuizStatusDto,
  ) {
    return this.practiceQuizzes.updateStatus(user.tenantId, id, dto.status, user.membershipId);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.practiceQuizzes.duplicate(user.tenantId, user.membershipId, id);
  }

  @Get(':id/activity')
  activity(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.auditLog.listForQuiz(user.tenantId, id);
  }

  @Get(':id/results')
  results(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.practiceQuizzes.results(user.tenantId, id);
  }

  @Get(':id/results/:attemptId')
  attemptDetail(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
  ) {
    return this.practiceQuizzes.attemptDetail(user.tenantId, id, attemptId);
  }

  @Get(':id/results/:attemptId/questions/:questionId/attachment-url')
  getAttemptQuestionAttachmentUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
    @Param('questionId') questionId: string,
  ) {
    return this.practiceQuizzes.getAttemptQuestionAttachmentUrl(
      user.tenantId,
      id,
      attemptId,
      questionId,
    );
  }

  @Get(':id/results/:attemptId/questions/:questionId/image-url')
  getAttemptQuestionImageUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
    @Param('questionId') questionId: string,
  ) {
    return this.practiceQuizzes.getAttemptQuestionImageUrl(user.tenantId, id, attemptId, questionId);
  }

  @Get(':id/results/:attemptId/questions/:questionId/options/:optionId/image-url')
  getAttemptOptionImageUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
    @Param('questionId') questionId: string,
    @Param('optionId') optionId: string,
  ) {
    return this.practiceQuizzes.getAttemptOptionImageUrl(
      user.tenantId,
      id,
      attemptId,
      questionId,
      optionId,
    );
  }

  @Post(':id/results/:attemptId/release-session')
  releaseAttemptSession(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
  ) {
    return this.practiceQuizzes.releaseAttemptSession(
      user.tenantId,
      id,
      attemptId,
      user.membershipId,
    );
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.practiceQuizzes.remove(user.tenantId, id);
  }
}
