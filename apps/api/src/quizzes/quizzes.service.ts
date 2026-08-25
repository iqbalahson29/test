import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { QuizStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';

const ALLOWED_TRANSITIONS: Record<QuizStatus, QuizStatus[]> = {
  DRAFT: [QuizStatus.PUBLISHED],
  PUBLISHED: [QuizStatus.ARCHIVED, QuizStatus.DRAFT],
  ARCHIVED: [],
};

@Injectable()
export class QuizzesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.quiz
      .findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { questions: true } } },
      })
      .then((quizzes) =>
        quizzes.map((q) => ({
          id: q.id,
          title: q.title,
          status: q.status,
          questionCount: q._count.questions,
          createdAt: q.createdAt,
          updatedAt: q.updatedAt,
        })),
      );
  }

  async findOne(tenantId: string, id: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: { options: { orderBy: { order: 'asc' } } },
        },
      },
    });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Quiz not found');
    }
    return quiz;
  }

  create(tenantId: string, createdByMembershipId: string, dto: CreateQuizDto) {
    return this.prisma.quiz.create({
      data: {
        tenantId,
        createdByMembershipId,
        title: dto.title,
        description: dto.description,
        timeLimitSec: dto.timeLimitSec,
        maxAttempts: dto.maxAttempts,
        shuffleQuestions: dto.shuffleQuestions ?? false,
        shuffleOptions: dto.shuffleOptions ?? false,
        availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : undefined,
        availableUntil: dto.availableUntil ? new Date(dto.availableUntil) : undefined,
        passMarkPercent: dto.passMarkPercent,
      },
    });
  }

  private async getOwnQuiz(tenantId: string, id: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Quiz not found');
    }
    return quiz;
  }

  async update(tenantId: string, id: string, dto: UpdateQuizDto) {
    const quiz = await this.getOwnQuiz(tenantId, id);
    if (quiz.status !== QuizStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT quizzes can be edited');
    }
    return this.prisma.quiz.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        timeLimitSec: dto.timeLimitSec,
        maxAttempts: dto.maxAttempts,
        shuffleQuestions: dto.shuffleQuestions,
        shuffleOptions: dto.shuffleOptions,
        availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : undefined,
        availableUntil: dto.availableUntil ? new Date(dto.availableUntil) : undefined,
        passMarkPercent: dto.passMarkPercent,
      },
    });
  }

  async updateStatus(tenantId: string, id: string, status: QuizStatus) {
    const quiz = await this.getOwnQuiz(tenantId, id);
    const allowed = ALLOWED_TRANSITIONS[quiz.status];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition a ${quiz.status} quiz to ${status}`,
      );
    }
    if (status === QuizStatus.PUBLISHED) {
      const questionCount = await this.prisma.question.count({
        where: { quizId: id },
      });
      if (questionCount === 0) {
        throw new BadRequestException(
          'Cannot publish a quiz with no questions',
        );
      }
    }
    return this.prisma.quiz.update({ where: { id }, data: { status } });
  }

  async remove(tenantId: string, id: string) {
    const quiz = await this.getOwnQuiz(tenantId, id);
    if (quiz.status !== QuizStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT quizzes can be deleted');
    }
    await this.prisma.quiz.delete({ where: { id } });
    return { id };
  }
}
