import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AccessTokenPayload } from '../auth/token.types';
import { AttemptsService } from './attempts.service';
import { RequestUploadUrlDto } from './dto/request-upload-url.dto';
import { SaveResponseDto } from './dto/save-response.dto';
import { StartAttemptDto } from './dto/start-attempt.dto';

@Controller('attempts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Post()
  start(@CurrentUser() user: AccessTokenPayload, @Body() dto: StartAttemptDto) {
    return this.attempts.start(user.tenantId, user.membershipId, dto.quizId, user.sessionId);
  }

  @Get()
  listForQuiz(
    @CurrentUser() user: AccessTokenPayload,
    @Query('quizId') quizId: string,
  ) {
    return this.attempts.listForQuiz(user.membershipId, quizId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.attempts.findOne(user.membershipId, id);
  }

  @Patch(':id/responses/:questionId')
  saveResponse(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: SaveResponseDto,
  ) {
    return this.attempts.saveResponse(user.membershipId, id, questionId, dto, user.sessionId);
  }

  @Post(':id/heartbeat')
  heartbeat(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.attempts.heartbeat(user.membershipId, id, user.sessionId);
  }

  @Get(':id/questions/:questionId/attachment-url')
  getAttachmentUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
  ) {
    return this.attempts.getAttachmentUrl(user.membershipId, id, questionId);
  }

  @Post(':id/responses/:questionId/upload-url')
  getUploadUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: RequestUploadUrlDto,
  ) {
    return this.attempts.getUploadUrl(user.membershipId, id, questionId, dto, user.sessionId);
  }

  @Post(':id/submit')
  submit(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.attempts.submit(user.membershipId, id, user.sessionId);
  }
}
