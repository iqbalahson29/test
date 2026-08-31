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
import { AuditLogService } from '../audit-log/audit-log.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AccessTokenPayload } from '../auth/token.types';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { UpdateQuizStatusDto } from './dto/update-quiz-status.dto';
import { QuizzesService } from './quizzes.service';

@Controller('quizzes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class QuizzesController {
  constructor(
    private readonly quizzes: QuizzesService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.quizzes.list(user.tenantId);
  }

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateQuizDto) {
    return this.quizzes.create(user.tenantId, user.membershipId, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.quizzes.findOne(user.tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateQuizDto,
  ) {
    return this.quizzes.update(user.tenantId, id, dto, user.membershipId);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateQuizStatusDto,
  ) {
    return this.quizzes.updateStatus(user.tenantId, id, dto.status, user.membershipId);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.quizzes.duplicate(user.tenantId, user.membershipId, id);
  }

  @Get(':id/activity')
  activity(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.auditLog.listForQuiz(user.tenantId, id);
  }

  @Get(':id/results')
  results(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.quizzes.results(user.tenantId, id);
  }

  @Get(':id/results/:attemptId')
  attemptDetail(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
  ) {
    return this.quizzes.attemptDetail(user.tenantId, id, attemptId);
  }

  @Post(':id/results/:attemptId/release-session')
  releaseAttemptSession(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
  ) {
    return this.quizzes.releaseAttemptSession(user.tenantId, id, attemptId, user.membershipId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.quizzes.remove(user.tenantId, id);
  }
}
