import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PracticeQuizMode, Prisma, QuestionDifficulty, QuestionType, QuizModule } from '@prisma/client';
import {
  getQuestionConfigSchema,
  OPTION_BASED_TYPES,
} from '@quiz-platform/shared';
import { PracticeAuditLogService } from '../practice-audit-log/audit-log.service';
import { PracticeGradingService } from '../practice-grading/practice-grading.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreatePracticeQuestionDto } from './dto/create-practice-question.dto';
import { PracticeQuestionOptionDto } from './dto/practice-question-option.dto';
import { RequestPracticeAttachmentUploadUrlDto } from './dto/request-practice-attachment-upload-url.dto';
import { UpdatePracticeQuestionDto } from './dto/update-practice-question.dto';

@Injectable()
export class PracticeQuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: PracticeAuditLogService,
    private readonly grading: PracticeGradingService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Questions can be added/edited/removed/reordered on a practice quiz in
   * any status, including PUBLISHED — teachers need to fix a wrong answer
   * key or wording after students have already started taking a live quiz.
   * Callers that change the question set follow up with
   * `grading.recomputeTotalsForQuiz` so already-submitted attempts' maxScore
   * stays in sync; scores themselves only change via an explicit regrade.
   */
  private async getOwnPracticeQuiz(tenantId: string, quizId: string) {
    const quiz = await this.prisma.practiceQuiz.findUnique({ where: { id: quizId } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Practice quiz not found');
    }
    return quiz;
  }

  /** BANK-mode quizzes only ever serve auto-graded questions (every draw
   * must be gradable with no human in the loop), so ESSAY/FILE_UPLOAD are
   * blocked outright and difficulty — the draw algorithm's only signal —
   * becomes required rather than optional. No-op for FIXED-mode quizzes. */
  private assertAllowedForBankMode(
    quizMode: PracticeQuizMode,
    type: QuestionType,
    difficulty: QuestionDifficulty | null | undefined,
  ) {
    if (quizMode !== PracticeQuizMode.BANK) return;
    if (type === QuestionType.ESSAY || type === QuestionType.FILE_UPLOAD) {
      throw new BadRequestException(
        `${type} questions aren't allowed on a question-bank quiz — every bank question must be auto-gradable`,
      );
    }
    if (!difficulty) {
      throw new BadRequestException('difficulty is required for a question-bank quiz');
    }
  }

  private validateConfigAndOptions(
    type: QuestionType,
    config: unknown,
    options: PracticeQuestionOptionDto[] | undefined,
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

  private async createRow(
    quiz: { id: string; mode: PracticeQuizMode },
    dto: CreatePracticeQuestionDto,
  ) {
    this.assertAllowedForBankMode(quiz.mode, dto.type, dto.difficulty);
    const config = this.validateConfigAndOptions(
      dto.type,
      dto.config,
      dto.options,
    );

    const quizId = quiz.id;
    const maxOrder = await this.prisma.practiceQuestion.aggregate({
      where: { quizId, module: dto.module },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    return this.prisma.practiceQuestion.create({
      data: {
        quizId,
        module: dto.module,
        type: dto.type,
        prompt: dto.prompt,
        points: dto.points,
        order: nextOrder,
        config,
        difficulty: dto.difficulty ?? null,
        attachmentKey: dto.attachmentKey || undefined,
        attachmentFilename: dto.attachmentFilename || undefined,
        attachmentMimeType: dto.attachmentMimeType || undefined,
        imageKey: dto.imageKey || undefined,
        imageFilename: dto.imageFilename || undefined,
        imageMimeType: dto.imageMimeType || undefined,
        options: dto.options
          ? {
              create: dto.options.map((o, i) => ({
                text: o.text,
                isCorrect: o.isCorrect,
                order: i,
                imageKey: o.imageKey || undefined,
                imageFilename: o.imageFilename || undefined,
                imageMimeType: o.imageMimeType || undefined,
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
    Prisma.PracticeQuestionUpdateInput,
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

  /** Same tri-state convention as resolveAttachmentUpdate, for the question's image. */
  private resolveImageUpdate(dto: {
    imageKey?: string;
    imageFilename?: string;
    imageMimeType?: string;
  }): Pick<Prisma.PracticeQuestionUpdateInput, 'imageKey' | 'imageFilename' | 'imageMimeType'> {
    if (dto.imageKey === undefined) return {};
    if (dto.imageKey === '') {
      return { imageKey: null, imageFilename: null, imageMimeType: null };
    }
    return {
      imageKey: dto.imageKey,
      imageFilename: dto.imageFilename ?? null,
      imageMimeType: dto.imageMimeType ?? null,
    };
  }

  /** Same tri-state convention, for an individual option's image. */
  private resolveOptionImageUpdate(dto: {
    imageKey?: string;
    imageFilename?: string;
    imageMimeType?: string;
  }): Pick<
    Prisma.PracticeQuestionOptionUpdateInput,
    'imageKey' | 'imageFilename' | 'imageMimeType'
  > {
    if (dto.imageKey === undefined) return {};
    if (dto.imageKey === '') {
      return { imageKey: null, imageFilename: null, imageMimeType: null };
    }
    return {
      imageKey: dto.imageKey,
      imageFilename: dto.imageFilename ?? null,
      imageMimeType: dto.imageMimeType ?? null,
    };
  }

  async create(
    tenantId: string,
    quizId: string,
    dto: CreatePracticeQuestionDto,
    actorMembershipId?: string,
  ) {
    const quiz = await this.getOwnPracticeQuiz(tenantId, quizId);
    const question = await this.createRow(quiz, dto);
    await this.auditLog.log(
      tenantId,
      quizId,
      actorMembershipId ?? null,
      'QUESTIONS_UPDATED',
    );
    // BANK-mode questions are never referenced by an existing attempt (every
    // attempt has its own frozen snapshot, fully decoupled from the live
    // bank), so there's nothing to recompute.
    if (quiz.mode !== PracticeQuizMode.BANK) {
      await this.grading.recomputeTotalsForQuiz(quizId);
    }
    return question;
  }

  async update(
    tenantId: string,
    quizId: string,
    questionId: string,
    dto: UpdatePracticeQuestionDto,
    actorMembershipId?: string,
  ) {
    const quiz = await this.getOwnPracticeQuiz(tenantId, quizId);
    const existing = await this.prisma.practiceQuestion.findUnique({
      where: { id: questionId },
    });
    if (!existing || existing.quizId !== quizId) {
      throw new NotFoundException('Question not found');
    }
    this.assertAllowedForBankMode(
      quiz.mode,
      existing.type,
      dto.difficulty !== undefined ? dto.difficulty : existing.difficulty,
    );

    let config: Prisma.InputJsonValue | undefined;
    if (dto.config !== undefined || dto.options !== undefined) {
      config = this.validateConfigAndOptions(
        existing.type,
        dto.config ?? existing.config,
        dto.options,
      );
    }

    // Moving a question to a different module appends it to the end of
    // that module's order, same as a freshly created question would get.
    let moduleUpdate: { module: QuizModule; order: number } | undefined;
    if (dto.module !== undefined && dto.module !== existing.module) {
      const maxOrder = await this.prisma.practiceQuestion.aggregate({
        where: { quizId, module: dto.module },
        _max: { order: true },
      });
      moduleUpdate = { module: dto.module, order: (maxOrder._max.order ?? -1) + 1 };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.options !== undefined) {
        // Upsert by id rather than delete-all-and-recreate: an option's id
        // is what a student's already-submitted `answer.optionId` points
        // at, so replacing an unchanged option with a fresh row (and a
        // fresh id) would silently orphan every past answer that picked
        // it — breaking regrade for exactly the "fix the wrong correct
        // answer after students already answered" case this is for.
        const existingOptions = await tx.practiceQuestionOption.findMany({
          where: { questionId },
          select: { id: true },
        });
        const existingIds = new Set(existingOptions.map((o) => o.id));
        const keptIds = new Set(
          dto.options.filter((o) => o.id && existingIds.has(o.id)).map((o) => o.id!),
        );
        const removedIds = [...existingIds].filter((id) => !keptIds.has(id));
        if (removedIds.length > 0) {
          await tx.practiceQuestionOption.deleteMany({ where: { id: { in: removedIds } } });
        }
        for (let i = 0; i < dto.options.length; i++) {
          const o = dto.options[i];
          if (o.id && keptIds.has(o.id)) {
            await tx.practiceQuestionOption.update({
              where: { id: o.id },
              data: {
                text: o.text,
                isCorrect: o.isCorrect,
                order: i,
                ...this.resolveOptionImageUpdate(o),
              },
            });
          } else {
            await tx.practiceQuestionOption.create({
              data: {
                questionId,
                text: o.text,
                isCorrect: o.isCorrect,
                order: i,
                imageKey: o.imageKey || undefined,
                imageFilename: o.imageFilename || undefined,
                imageMimeType: o.imageMimeType || undefined,
              },
            });
          }
        }
      }
      return tx.practiceQuestion.update({
        where: { id: questionId },
        data: {
          ...moduleUpdate,
          prompt: dto.prompt,
          points: dto.points,
          config,
          difficulty: dto.difficulty,
          ...this.resolveAttachmentUpdate(dto),
          ...this.resolveImageUpdate(dto),
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
    if (quiz.mode !== PracticeQuizMode.BANK) {
      await this.grading.recomputeTotalsForQuiz(quizId);
    }
    return updated;
  }

  /** Clones a question (prompt, points, config, options) to the end of the same practice quiz. */
  async duplicate(
    tenantId: string,
    quizId: string,
    questionId: string,
    actorMembershipId?: string,
  ) {
    const quiz = await this.getOwnPracticeQuiz(tenantId, quizId);
    const existing = await this.prisma.practiceQuestion.findUnique({
      where: { id: questionId },
      include: { options: { orderBy: { order: 'asc' } } },
    });
    if (!existing || existing.quizId !== quizId) {
      throw new NotFoundException('Question not found');
    }

    const maxOrder = await this.prisma.practiceQuestion.aggregate({
      where: { quizId, module: existing.module },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const copy = await this.prisma.practiceQuestion.create({
      data: {
        quizId,
        module: existing.module,
        type: existing.type,
        prompt: `${existing.prompt} (Copy)`,
        points: existing.points,
        order: nextOrder,
        config: existing.config ?? {},
        difficulty: existing.difficulty,
        attachmentKey: existing.attachmentKey,
        attachmentFilename: existing.attachmentFilename,
        attachmentMimeType: existing.attachmentMimeType,
        imageKey: existing.imageKey,
        imageFilename: existing.imageFilename,
        imageMimeType: existing.imageMimeType,
        options: {
          create: existing.options.map((o) => ({
            text: o.text,
            isCorrect: o.isCorrect,
            order: o.order,
            imageKey: o.imageKey,
            imageFilename: o.imageFilename,
            imageMimeType: o.imageMimeType,
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
    if (quiz.mode !== PracticeQuizMode.BANK) {
      await this.grading.recomputeTotalsForQuiz(quizId);
    }
    return copy;
  }

  /**
   * Creates as many rows as validate; per-row failures are collected instead of
   * aborting the batch, so a bulk import can report which lines need fixing.
   */
  async importMany(
    tenantId: string,
    quizId: string,
    dtos: CreatePracticeQuestionDto[],
    actorMembershipId?: string,
  ) {
    const quiz = await this.getOwnPracticeQuiz(tenantId, quizId);

    const created: Awaited<ReturnType<PracticeQuestionsService['createRow']>>[] = [];
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < dtos.length; i++) {
      try {
        created.push(await this.createRow(quiz, dtos[i]));
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
      if (quiz.mode !== PracticeQuizMode.BANK) {
        await this.grading.recomputeTotalsForQuiz(quizId);
      }
    }

    return { created, errors };
  }

  async remove(
    tenantId: string,
    quizId: string,
    questionId: string,
    actorMembershipId?: string,
  ) {
    const quiz = await this.getOwnPracticeQuiz(tenantId, quizId);
    const existing = await this.prisma.practiceQuestion.findUnique({
      where: { id: questionId },
    });
    if (!existing || existing.quizId !== quizId) {
      throw new NotFoundException('Question not found');
    }
    await this.prisma.practiceQuestion.delete({ where: { id: questionId } });
    await this.auditLog.log(
      tenantId,
      quizId,
      actorMembershipId ?? null,
      'QUESTIONS_UPDATED',
    );
    if (quiz.mode !== PracticeQuizMode.BANK) {
      await this.grading.recomputeTotalsForQuiz(quizId);
    }
    return { id: questionId };
  }

  async reorder(
    tenantId: string,
    quizId: string,
    module: QuizModule,
    orderedIds: string[],
    actorMembershipId?: string,
  ) {
    await this.getOwnPracticeQuiz(tenantId, quizId);
    const existing = await this.prisma.practiceQuestion.findMany({
      where: { quizId, module },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((q) => q.id));
    const providedIds = new Set(orderedIds);

    const sameSet =
      existingIds.size === providedIds.size &&
      [...existingIds].every((id) => providedIds.has(id));
    if (!sameSet) {
      throw new BadRequestException(
        "orderedIds must exactly match this module's current question ids",
      );
    }

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.practiceQuestion.update({ where: { id }, data: { order: index } }),
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
    dto: RequestPracticeAttachmentUploadUrlDto,
  ) {
    await this.getOwnPracticeQuiz(tenantId, quizId);
    const safeFilename = dto.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const attachmentKey = `practice-quizzes/${quizId}/question-attachments/${randomUUID()}-${safeFilename}`;
    const uploadUrl = await this.storage.getUploadUrl(attachmentKey, dto.contentType);
    return { uploadUrl, attachmentKey };
  }

  async getAttachmentViewUrl(tenantId: string, quizId: string, questionId: string) {
    await this.getOwnPracticeQuiz(tenantId, quizId);
    const question = await this.prisma.practiceQuestion.findUnique({
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

  async getImageViewUrl(tenantId: string, quizId: string, questionId: string) {
    await this.getOwnPracticeQuiz(tenantId, quizId);
    const question = await this.prisma.practiceQuestion.findUnique({
      where: { id: questionId },
    });
    if (!question || question.quizId !== quizId) {
      throw new NotFoundException('Question not found');
    }
    if (!question.imageKey) {
      throw new NotFoundException('This question has no image');
    }
    const viewUrl = await this.storage.getViewUrl(
      question.imageKey,
      question.imageFilename ?? 'image',
    );
    return { viewUrl, filename: question.imageFilename, mimeType: question.imageMimeType };
  }

  async getOptionImageViewUrl(
    tenantId: string,
    quizId: string,
    questionId: string,
    optionId: string,
  ) {
    await this.getOwnPracticeQuiz(tenantId, quizId);
    const option = await this.prisma.practiceQuestionOption.findUnique({
      where: { id: optionId },
      include: { question: true },
    });
    if (!option || option.question.quizId !== quizId || option.questionId !== questionId) {
      throw new NotFoundException('Option not found');
    }
    if (!option.imageKey) {
      throw new NotFoundException('This option has no image');
    }
    const viewUrl = await this.storage.getViewUrl(option.imageKey, option.imageFilename ?? 'image');
    return { viewUrl, filename: option.imageFilename, mimeType: option.imageMimeType };
  }
}
