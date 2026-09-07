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
import { PracticeAttemptsService } from './practice-attempts.service';
import { RequestPracticeUploadUrlDto } from './dto/request-practice-upload-url.dto';
import { SavePracticeResponseDto } from './dto/save-practice-response.dto';
import { StartPracticeAttemptDto } from './dto/start-practice-attempt.dto';

@Controller('practice-attempts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class PracticeAttemptsController {
  constructor(private readonly attempts: PracticeAttemptsService) {}

  @Post()
  start(@CurrentUser() user: AccessTokenPayload, @Body() dto: StartPracticeAttemptDto) {
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
    @Body() dto: SavePracticeResponseDto,
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

  @Get(':id/questions/:questionId/image-url')
  getImageUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
  ) {
    return this.attempts.getImageUrl(user.membershipId, id, questionId);
  }

  @Get(':id/questions/:questionId/options/:optionId/image-url')
  getOptionImageUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Param('optionId') optionId: string,
  ) {
    return this.attempts.getOptionImageUrl(user.membershipId, id, questionId, optionId);
  }

  @Post(':id/responses/:questionId/upload-url')
  getUploadUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: RequestPracticeUploadUrlDto,
  ) {
    return this.attempts.getUploadUrl(user.membershipId, id, questionId, dto, user.sessionId);
  }

  @Post(':id/modules/complete')
  completeCurrentModule(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.attempts.completeCurrentModule(user.membershipId, id, user.sessionId);
  }

  @Post(':id/modules/begin-next')
  beginNextModule(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.attempts.beginNextModule(user.membershipId, id, user.sessionId);
  }
}
