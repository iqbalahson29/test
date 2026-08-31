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
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AccessTokenPayload } from '../auth/token.types';
import { CreateQuestionDto } from './dto/create-question.dto';
import { ImportQuestionsDto } from './dto/import-questions.dto';
import { RequestAttachmentUploadUrlDto } from './dto/request-attachment-upload-url.dto';
import { ReorderQuestionsDto } from './dto/reorder-questions.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QuestionsService } from './questions.service';

@Controller('quizzes/:quizId/questions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.questions.create(user.tenantId, quizId, dto, user.membershipId);
  }

  @Post('import')
  import(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
    @Body() dto: ImportQuestionsDto,
  ) {
    return this.questions.importMany(
      user.tenantId,
      quizId,
      dto.questions,
      user.membershipId,
    );
  }

  // Must come before ':id/...' routes so Nest doesn't match these literal
  // segments as an :id param.
  @Post('attachment-upload-url')
  getAttachmentUploadUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
    @Body() dto: RequestAttachmentUploadUrlDto,
  ) {
    return this.questions.getAttachmentUploadUrl(user.tenantId, quizId, dto);
  }

  @Patch('reorder')
  reorder(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
    @Body() dto: ReorderQuestionsDto,
  ) {
    return this.questions.reorder(
      user.tenantId,
      quizId,
      dto.orderedIds,
      user.membershipId,
    );
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
    @Param('id') id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.questions.update(user.tenantId, quizId, id, dto, user.membershipId);
  }

  @Get(':id/attachment-url')
  getAttachmentViewUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
    @Param('id') id: string,
  ) {
    return this.questions.getAttachmentViewUrl(user.tenantId, quizId, id);
  }

  @Post(':id/duplicate')
  duplicate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
    @Param('id') id: string,
  ) {
    return this.questions.duplicate(user.tenantId, quizId, id, user.membershipId);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
    @Param('id') id: string,
  ) {
    return this.questions.remove(user.tenantId, quizId, id, user.membershipId);
  }
}
