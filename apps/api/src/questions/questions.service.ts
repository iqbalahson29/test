import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuestionType } from '@prisma/client';
import {
  getQuestionConfigSchema,
  OPTION_BASED_TYPES,
} from '@quiz-platform/shared';
import { AuditLogService } from '../audit-log/audit-log.service';
import { GradingService } from '../grading/grading.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { QuestionOptionDto } from './dto/question-option.dto';
import { RequestAttachmentUploadUrlDto } from './dto/request-attachment-upload-url.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly grading: GradingService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Questions can be added/edited/removed/reordered on a quiz in any
   * status, including PUBLISHED — teachers need to fix a wrong answer key
   * or wording after students have already started taking a live quiz.
   * Callers that change the question set follow up with
   * `grading.recomputeTotalsForQuiz` so already-submitted attempts' maxScore
   * stays in sync; scores themselves only change via an explicit regrade.
   */
  private async getOwnQuiz(tenantId: string, quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Quiz not found');
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

    return parsed.data;
  }

  private async createRow(quizId: string, dto: CreateQuestionDto) {
    const config = this.validateConfigAndOptions(
      dto.type,
      dto.config,
      dto.options,
    );

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
        attachmentKey: dto.attachmentKey || undefined,
        attachmentFilename: dto.attachmentFilename || undefined,
        attachmentMimeType: dto.attachmentMimeType || undefined,
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

  /**
   * `attachmentKey` on the DTO is the tri-state signal: undefined means
   * "leave the attachment as-is", '' means "remove it", any other string
   * means "replace it" (filename/mimeType are expected to be sent together).
   */
  private resolveAttachmentUpdate(dto: {
    attachmentKey?: string;
    attachmentFilename?: string;
    attachmentMimeType?: string;
  }): Pick<
    Prisma.QuestionUpdateInput,
    'attachmentKey' | 'attachmentFilename' | 'attachmentMimeType'
  > {
    if (dto.attachmentKey === undefined) return {};
    if (dto.attachmentKey === '') {
      return { attachmentKey: null, attachmentFilename: null, attachmentMimeType: null };
    }
    return {
      attachmentKey: dto.attachmentKey,
      attachmentFilename: dto.attachmentFilename ?? null,
      attachmentMimeType: dto.attachmentMimeType ?? null,
    };
  }

  async create(
    tenantId: string,
    quizId: string,
    dto: CreateQuestionDto,
    actorMembershipId?: string,
  ) {
    await this.getOwnQuiz(tenantId, quizId);
    const question = await this.createRow(quizId, dto);
    await this.auditLog.log(
      tenantId,
      quizId,
      actorMembershipId ?? null,
      'QUESTIONS_UPDATED',
    );
    await this.grading.recomputeTotalsForQuiz(quizId);
    return question;
  }

  async update(
    tenantId: string,
    quizId: string,
    questionId: string,
    dto: UpdateQuestionDto,
    actorMembershipId?: string,
  ) {
    await this.getOwnQuiz(tenantId, quizId);
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

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.options !== undefined) {
        // Upsert by id rather than delete-all-and-recreate: an option's id
        // is what a student's already-submitted `answer.optionId` points
        // at, so replacing an unchanged option with a fresh row (and a
        // fresh id) would silently orphan every past answer that picked
        // it — breaking regrade for exactly the "fix the wrong correct
        // answer after students already answered" case this is for.
        const existingOptions = await tx.questionOption.findMany({
          where: { questionId },
          select: { id: true },
        });
        const existingIds = new Set(existingOptions.map((o) => o.id));
        const keptIds = new Set(
          dto.options.filter((o) => o.id && existingIds.has(o.id)).map((o) => o.id!),
        );
        const removedIds = [...existingIds].filter((id) => !keptIds.has(id));
        if (removedIds.length > 0) {
          await tx.questionOption.deleteMany({ where: { id: { in: removedIds } } });
        }
        for (let i = 0; i < dto.options.length; i++) {
          const o = dto.options[i];
          if (o.id && keptIds.has(o.id)) {
            await tx.questionOption.update({
              where: { id: o.id },
              data: { text: o.text, isCorrect: o.isCorrect, order: i },
            });
          } else {
            await tx.questionOption.create({
              data: { questionId, text: o.text, isCorrect: o.isCorrect, order: i },
            });
          }
        }
      }
      return tx.question.update({
        where: { id: questionId },
        data: {
          prompt: dto.prompt,
          points: dto.points,
          config,
          ...this.resolveAttachmentUpdate(dto),
        },
        include: { options: { orderBy: { order: 'asc' } } },
      });
    });
    await this.auditLog.log(
      tenantId,
      quizId,
      actorMembershipId ?? null,
      'QUESTIONS_UPDATED',
    );
    await this.grading.recomputeTotalsForQuiz(quizId);
    return updated;
  }

  /** Clones a question (prompt, points, config, options) to the end of the same quiz. */
  async duplicate(
    tenantId: string,
    quizId: string,
    questionId: string,
    actorMembershipId?: string,
  ) {
    await this.getOwnQuiz(tenantId, quizId);
    const existing = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { options: { orderBy: { order: 'asc' } } },
    });
    if (!existing || existing.quizId !== quizId) {
      throw new NotFoundException('Question not found');
    }

    const maxOrder = await this.prisma.question.aggregate({
      where: { quizId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const copy = await this.prisma.question.create({
      data: {
        quizId,
        type: existing.type,
        prompt: `${existing.prompt} (Copy)`,
        points: existing.points,
        order: nextOrder,
        config: existing.config ?? {},
        attachmentKey: existing.attachmentKey,
        attachmentFilename: existing.attachmentFilename,
        attachmentMimeType: existing.attachmentMimeType,
        options: {
          create: existing.options.map((o) => ({
            text: o.text,
            isCorrect: o.isCorrect,
            order: o.order,
          })),
        },
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });
    await this.auditLog.log(
      tenantId,
      quizId,
      actorMembershipId ?? null,
      'QUESTIONS_UPDATED',
    );
    await this.grading.recomputeTotalsForQuiz(quizId);
    return copy;
  }

  /**
   * Creates as many rows as validate; per-row failures are collected instead of
   * aborting the batch, so a CSV import can report which lines need fixing.
   */
  async importMany(
    tenantId: string,
    quizId: string,
    dtos: CreateQuestionDto[],
    actorMembershipId?: string,
  ) {
    await this.getOwnQuiz(tenantId, quizId);

    const created: Awaited<ReturnType<QuestionsService['createRow']>>[] = [];
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < dtos.length; i++) {
      try {
        created.push(await this.createRow(quizId, dtos[i]));
      } catch (err) {
        const message =
          err instanceof BadRequestException
            ? ((err.getResponse() as { message?: string })?.message ??
              err.message)
            : 'Could not create question';
        errors.push({ row: i + 1, message });
      }
    }

    if (created.length > 0) {
      await this.auditLog.log(
        tenantId,
        quizId,
        actorMembershipId ?? null,
        'QUESTIONS_UPDATED',
      );
      await this.grading.recomputeTotalsForQuiz(quizId);
    }

    return { created, errors };
  }

  async remove(
    tenantId: string,
    quizId: string,
    questionId: string,
    actorMembershipId?: string,
  ) {
    await this.getOwnQuiz(tenantId, quizId);
    const existing = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!existing || existing.quizId !== quizId) {
      throw new NotFoundException('Question not found');
    }
    await this.prisma.question.delete({ where: { id: questionId } });
    await this.auditLog.log(
      tenantId,
      quizId,
      actorMembershipId ?? null,
      'QUESTIONS_UPDATED',
    );
    await this.grading.recomputeTotalsForQuiz(quizId);
    return { id: questionId };
  }

  async reorder(
    tenantId: string,
    quizId: string,
    orderedIds: string[],
    actorMembershipId?: string,
  ) {
    await this.getOwnQuiz(tenantId, quizId);
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
    await this.auditLog.log(
      tenantId,
      quizId,
      actorMembershipId ?? null,
      'QUESTIONS_UPDATED',
    );
    return { ok: true };
  }

  /**
   * Requested against the quiz (not a specific question) so a teacher can
   * upload the file before the question row exists yet — the resulting key
   * is attached on create/update, same as attempts' file-upload flow.
   */
  async getAttachmentUploadUrl(
    tenantId: string,
    quizId: string,
    dto: RequestAttachmentUploadUrlDto,
  ) {
    await this.getOwnQuiz(tenantId, quizId);
    const safeFilename = dto.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const attachmentKey = `quizzes/${quizId}/question-attachments/${randomUUID()}-${safeFilename}`;
    const uploadUrl = await this.storage.getUploadUrl(attachmentKey, dto.contentType);
    return { uploadUrl, attachmentKey };
  }

  async getAttachmentViewUrl(tenantId: string, quizId: string, questionId: string) {
    await this.getOwnQuiz(tenantId, quizId);
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question || question.quizId !== quizId) {
      throw new NotFoundException('Question not found');
    }
    if (!question.attachmentKey) {
      throw new NotFoundException('This question has no attachment');
    }
    const viewUrl = await this.storage.getViewUrl(
      question.attachmentKey,
      question.attachmentFilename ?? 'document',
    );
    return { viewUrl, filename: question.attachmentFilename, mimeType: question.attachmentMimeType };
  }
}
