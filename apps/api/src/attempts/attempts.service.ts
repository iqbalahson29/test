import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttemptStatus, Prisma, QuestionType, QuizStatus } from '@prisma/client';
import { GradingService } from '../grading/grading.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { RequestUploadUrlDto } from './dto/request-upload-url.dto';
import { SaveResponseDto } from './dto/save-response.dto';
import { sanitizeQuestion } from './question-sanitizer';

@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly grading: GradingService,
    private readonly storage: StorageService,
  ) {}

  private async verifyAssigned(
    tenantId: string,
    studentMembershipId: string,
    quizId: string,
  ) {
    const groupMemberships = await this.prisma.groupMember.findMany({
      where: { membershipId: studentMembershipId },
      select: { groupId: true },
    });
    const groupIds = groupMemberships.map((g) => g.groupId);

    const assignment = await this.prisma.quizAssignment.findFirst({
      where: {
        tenantId,
        quizId,
        OR: [
          { studentMembershipId },
          ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : []),
        ],
      },
    });
    if (!assignment) {
      throw new ForbiddenException('This quiz is not assigned to you');
    }
  }

  private async buildAttemptView(attemptId: string, studentMembershipId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: {
          include: {
            questions: {
              orderBy: { order: 'asc' },
              include: { options: { orderBy: { order: 'asc' } } },
            },
          },
        },
        responses: true,
      },
    });
    if (!attempt || attempt.studentMembershipId !== studentMembershipId) {
      throw new NotFoundException('Attempt not found');
    }

    const responseByQuestion = new Map(
      attempt.responses.map((r) => [r.questionId, r]),
    );

    return {
      id: attempt.id,
      quizId: attempt.quizId,
      quizTitle: attempt.quiz.title,
      timeLimitSec: attempt.quiz.timeLimitSec,
      status: attempt.status,
      attemptNumber: attempt.attemptNumber,
      maxAttempts: attempt.quiz.maxAttempts,
      attemptsRemaining:
        attempt.quiz.maxAttempts != null
          ? Math.max(0, attempt.quiz.maxAttempts - attempt.attemptNumber)
          : null,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      maxScore: attempt.maxScore,
      questions: attempt.quiz.questions.map((q) => {
        const sanitized = sanitizeQuestion(q);
        const response = responseByQuestion.get(q.id);
        return {
          ...sanitized,
          answer: response?.answer ?? null,
          fileKey: response?.fileKey ?? null,
          awardedPoints: response?.awardedPoints ?? null,
          feedback: response?.feedback ?? null,
        };
      }),
    };
  }

  async start(tenantId: string, studentMembershipId: string, quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Quiz not found');
    }
    if (quiz.status !== QuizStatus.PUBLISHED) {
      throw new BadRequestException('Quiz is not published');
    }

    await this.verifyAssigned(tenantId, studentMembershipId, quizId);

    const existingInProgress = await this.prisma.attempt.findFirst({
      where: { quizId, studentMembershipId, status: AttemptStatus.IN_PROGRESS },
    });
    if (existingInProgress) {
      return this.buildAttemptView(existingInProgress.id, studentMembershipId);
    }

    const priorCount = await this.prisma.attempt.count({
      where: {
        quizId,
        studentMembershipId,
        status: { not: AttemptStatus.IN_PROGRESS },
      },
    });
    if (quiz.maxAttempts != null && priorCount >= quiz.maxAttempts) {
      throw new BadRequestException('No attempts remaining for this quiz');
    }

    const attempt = await this.prisma.attempt.create({
      data: {
        quizId,
        studentMembershipId,
        attemptNumber: priorCount + 1,
        status: AttemptStatus.IN_PROGRESS,
      },
    });
    return this.buildAttemptView(attempt.id, studentMembershipId);
  }

  findOne(studentMembershipId: string, attemptId: string) {
    return this.buildAttemptView(attemptId, studentMembershipId);
  }

  listForQuiz(studentMembershipId: string, quizId: string) {
    return this.prisma.attempt.findMany({
      where: { quizId, studentMembershipId },
      orderBy: { attemptNumber: 'desc' },
    });
  }

  async saveResponse(
    studentMembershipId: string,
    attemptId: string,
    questionId: string,
    dto: SaveResponseDto,
  ) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.studentMembershipId !== studentMembershipId) {
      throw new NotFoundException('Attempt not found');
    }
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Attempt is no longer in progress');
    }

    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question || question.quizId !== attempt.quizId) {
      throw new NotFoundException('Question not found on this attempt');
    }

    const answer =
      dto.answer === undefined ? undefined : (dto.answer as Prisma.InputJsonValue);

    await this.prisma.response.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      update: { answer, fileKey: dto.fileKey },
      create: { attemptId, questionId, answer, fileKey: dto.fileKey },
    });
    return { ok: true };
  }

  async getUploadUrl(
    studentMembershipId: string,
    attemptId: string,
    questionId: string,
    dto: RequestUploadUrlDto,
  ) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.studentMembershipId !== studentMembershipId) {
      throw new NotFoundException('Attempt not found');
    }
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Attempt is no longer in progress');
    }

    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question || question.quizId !== attempt.quizId) {
      throw new NotFoundException('Question not found on this attempt');
    }
    if (question.type !== QuestionType.FILE_UPLOAD) {
      throw new BadRequestException('This question does not accept file uploads');
    }

    const safeFilename = dto.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileKey = `attempts/${attemptId}/${questionId}/${randomUUID()}-${safeFilename}`;
    const uploadUrl = await this.storage.getUploadUrl(fileKey, dto.contentType);
    return { uploadUrl, fileKey };
  }

  async submit(studentMembershipId: string, attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.studentMembershipId !== studentMembershipId) {
      throw new NotFoundException('Attempt not found');
    }
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Attempt is not in progress');
    }
    await this.prisma.attempt.update({
      where: { id: attemptId },
      data: { status: AttemptStatus.SUBMITTED, submittedAt: new Date() },
    });
    await this.grading.gradeAttempt(attemptId);
    return this.buildAttemptView(attemptId, studentMembershipId);
  }
}
