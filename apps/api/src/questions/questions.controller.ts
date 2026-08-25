import {
  Body,
  Controller,
  Delete,
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
    return this.questions.create(user.tenantId, quizId, dto);
  }

  // Must come before ':id' so Nest doesn't match 'reorder' as an :id param.
  @Patch('reorder')
  reorder(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
    @Body() dto: ReorderQuestionsDto,
  ) {
    return this.questions.reorder(user.tenantId, quizId, dto.orderedIds);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
    @Param('id') id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.questions.update(user.tenantId, quizId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
    @Param('id') id: string,
  ) {
    return this.questions.remove(user.tenantId, quizId, id);
  }
}
