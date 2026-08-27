import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuestionType } from '@prisma/client';
import { getQuestionConfigSchema, OPTION_BASED_TYPES } from '@quiz-platform/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { QuestionOptionDto } from './dto/question-option.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getDraftQuiz(tenantId: string, quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Quiz not found');
    }
    if (quiz.status !== 'DRAFT') {
      throw new BadRequestException(
        'Quiz must be in DRAFT status to modify its questions',
      );
    }
    return quiz;
  }

  private validateConfigAndOptions(
    type: QuestionType,
    config: unknown,
    options: QuestionOptionDto[] | undefined,
  ): Prisma.InputJsonValue {
    const schema = getQuestionConfigSchema(type);
    const parsed = schema.safeParse(config ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        message: `Invalid config for question type ${type}`,
        issues: parsed.error.issues,
      });
    }

    const isOptionBased = (OPTION_BASED_TYPES as string[]).includes(type);
    if (isOptionBased) {
      if (!options || options.length < 2) {
        throw new BadRequestException(
          `${type} questions require at least 2 options`,
        );
      }
      if (type === 'TRUE_FALSE' && options.length !== 2) {
        throw new BadRequestException(
          'TRUE_FALSE questions must have exactly 2 options',
        );
      }
      const correctCount = options.filter((o) => o.isCorrect).length;
      if (type === 'MCQ_MULTI') {
        if (correctCount < 1) {
          throw new BadRequestException(
            'MCQ_MULTI requires at least one correct option',
          );
        }
      } else if (correctCount !== 1) {
        throw new BadRequestException(
          `${type} requires exactly one correct option`,
        );
      }
    } else if (options && options.length > 0) {
      throw new BadRequestException(`${type} questions do not use options`);
    }

    return parsed.data as Prisma.InputJsonValue;
  }

  async create(tenantId: string, quizId: string, dto: CreateQuestionDto) {
    await this.getDraftQuiz(tenantId, quizId);
    const config = this.validateConfigAndOptions(dto.type, dto.config, dto.options);

    const maxOrder = await this.prisma.question.aggregate({
      where: { quizId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    return this.prisma.question.create({
      data: {
        quizId,
        type: dto.type,
        prompt: dto.prompt,
        points: dto.points,
        order: nextOrder,
        config,
        options: dto.options
          ? {
              create: dto.options.map((o, i) => ({
                text: o.text,
                isCorrect: o.isCorrect,
                order: i,
              })),
            }
          : undefined,
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });
  }

  async update(
    tenantId: string,
    quizId: string,
    questionId: string,
    dto: UpdateQuestionDto,
  ) {
    await this.getDraftQuiz(tenantId, quizId);
    const existing = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!existing || existing.quizId !== quizId) {
      throw new NotFoundException('Question not found');
    }

    let config: Prisma.InputJsonValue | undefined;
    if (dto.config !== undefined || dto.options !== undefined) {
      config = this.validateConfigAndOptions(
        existing.type,
        dto.config ?? existing.config,
        dto.options,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.options !== undefined) {
        await tx.questionOption.deleteMany({ where: { questionId } });
      }
      return tx.question.update({
        where: { id: questionId },
        data: {
          prompt: dto.prompt,
          points: dto.points,
          config,
          options: dto.options
            ? {
                create: dto.options.map((o, i) => ({
                  text: o.text,
                  isCorrect: o.isCorrect,
                  order: i,
                })),
              }
            : undefined,
        },
        include: { options: { orderBy: { order: 'asc' } } },
      });
    });
  }

  async remove(tenantId: string, quizId: string, questionId: string) {
    await this.getDraftQuiz(tenantId, quizId);
    const existing = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!existing || existing.quizId !== quizId) {
      throw new NotFoundException('Question not found');
    }
    await this.prisma.question.delete({ where: { id: questionId } });
    return { id: questionId };
  }

  async reorder(tenantId: string, quizId: string, orderedIds: string[]) {
    await this.getDraftQuiz(tenantId, quizId);
    const existing = await this.prisma.question.findMany({
      where: { quizId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((q) => q.id));
    const providedIds = new Set(orderedIds);

    const sameSet =
      existingIds.size === providedIds.size &&
      [...existingIds].every((id) => providedIds.has(id));
    if (!sameSet) {
      throw new BadRequestException(
        "orderedIds must exactly match the quiz's current question ids",
      );
    }

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.question.update({ where: { id }, data: { order: index } }),
      ),
    );
    return { ok: true };
  }
}
