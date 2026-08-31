import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { AssignmentsService } from './assignments.service';
import { AssignAllDto } from './dto/assign-all.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';

@Controller('assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.assignments.create(user.tenantId, user.membershipId, dto);
  }

  @Post('all')
  @Roles(Role.ADMIN)
  assignToAll(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: AssignAllDto,
  ) {
    return this.assignments.assignToAll(
      user.tenantId,
      user.membershipId,
      dto.quizId,
      dto.dueAt,
    );
  }

  @Get()
  @Roles(Role.ADMIN)
  listForQuiz(
    @CurrentUser() user: AccessTokenPayload,
    @Query('quizId') quizId: string,
  ) {
    return this.assignments.listForQuiz(user.tenantId, quizId);
  }

  @Get('summary')
  @Roles(Role.ADMIN)
  summaryForQuiz(
    @CurrentUser() user: AccessTokenPayload,
    @Query('quizId') quizId: string,
  ) {
    return this.assignments.summaryForQuiz(user.tenantId, quizId);
  }

  @Get('mine')
  @Roles(Role.STUDENT)
  mine(@CurrentUser() user: AccessTokenPayload) {
    return this.assignments.mine(user.tenantId, user.membershipId);
  }

  @Get('calendar')
  @Roles(Role.ADMIN)
  listAll(@CurrentUser() user: AccessTokenPayload) {
    return this.assignments.listAll(user.tenantId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.assignments.remove(user.tenantId, id, user.membershipId);
  }
}
