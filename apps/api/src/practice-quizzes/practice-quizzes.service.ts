import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PracticeQuizMode, QuizStatus } from '@prisma/client';
import { QUIZ_MODULE_SEQUENCE } from '@quiz-platform/shared';
import { PracticeAuditLogService } from '../practice-audit-log/audit-log.service';
import { SESSION_LOCK_TIMEOUT_MS } from '../common/session-lock.constants';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  BankDifficultyRatio,
  BankModuleTargets,
  DEFAULT_BANK_DIFFICULTY_RATIO,
  formatShortfalls,
  validateBankCoverage,
} from './bank-mode.util';
import { CreatePracticeQuizDto } from './dto/create-practice-quiz.dto';
import { UpdatePracticeQuizDto } from './dto/update-practice-quiz.dto';

/** Cross-field checks class-validator can't express on its own (ratio must
 * sum to 100) — same convention as AssignmentsService's "exactly one of
 * X/Y/Z" checks. Throws if `ratio` is present and invalid; returns the
 * ratio to persist (falling back to the platform default) when mode is
 * BANK, or undefined for FIXED. */
function resolveBankSettings(
  mode: PracticeQuizMode,
  targets: BankModuleTargets | undefined,
  ratio: BankDifficultyRatio | undefined,
): { bankModuleTargets: Prisma.InputJsonValue | undefined; bankDifficultyRatio: Prisma.InputJsonValue | undefined } {
  if (mode !== PracticeQuizMode.BANK) {
    return { bankModuleTargets: undefined, bankDifficultyRatio: undefined };
  }
  if (!targets) {
    throw new BadRequestException('bankModuleTargets is required for a question-bank quiz');
  }
  const resolvedRatio = ratio ?? DEFAULT_BANK_DIFFICULTY_RATIO;
  const sum = resolvedRatio.EASY + resolvedRatio.MEDIUM + resolvedRatio.HARD;
  if (sum !== 100) {
    throw new BadRequestException(
      `bankDifficultyRatio must sum to 100 (got ${sum})`,
    );
  }
  return { bankModuleTargets: targets, bankDifficultyRatio: resolvedRatio };
}

/** Mirrors PracticeAttemptsService's own lock-liveness check, for the
 * read-only teacher-facing "is this attempt active right now" indicator. */
function isSessionLive(lockSessionId: string | null, lastHeartbeatAt: Date | null): boolean {
  if (!lockSessionId || !lastHeartbeatAt) return false;
  return lastHeartbeatAt.getTime() > Date.now() - SESSION_LOCK_TIMEOUT_MS;
}

const ALLOWED_TRANSITIONS: Record<QuizStatus, QuizStatus[]> = {
  DRAFT: [QuizStatus.PUBLISHED, QuizStatus.SCHEDULED],
  SCHEDULED: [QuizStatus.PUBLISHED, QuizStatus.DRAFT, QuizStatus.ARCHIVED],
  PUBLISHED: [QuizStatus.ARCHIVED, QuizStatus.DRAFT],
  // Restoring an archived quiz always lands it back in Draft — attempts,
  // responses, and scores were never touched by archiving in the first
  // place (they key off quizId, not quiz.status), so nothing needs
  // restoring there; this only re-opens the quiz for editing/republishing.
  ARCHIVED: [QuizStatus.DRAFT],
};

@Injectable()
export class PracticeQuizzesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: PracticeAuditLogService,
    private readonly storage: StorageService,
  ) {}

  private async averageScorePercentFor(quizId: string): Promise<number | null> {
    const graded = await this.prisma.practiceAttempt.findMany({
      where: { quizId, status: 'GRADED' },
      select: { score: true, maxScore: true },
    });
    const percents = graded.map((a) => (Number(a.score) / Number(a.maxScore)) * 100);
    return percents.length > 0
      ? Math.round((percents.reduce((sum, p) => sum + p, 0) / percents.length) * 100) /
          100
      : null;
  }

  async list(tenantId: string) {
    const quizzes = await this.prisma.practiceQuiz.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { questions: true, attempts: true } } },
    });

    return Promise.all(
      quizzes.map(async (q) => ({
        id: q.id,
        title: q.title,
        status: q.status,
        mode: q.mode,
        questionCount: q._count.questions,
        attemptCount: q._count.attempts,
        averageScorePercent: await this.averageScorePercentFor(q.id),
        availableFrom: q.availableFrom,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      })),
    );
  }

  async findOne(tenantId: string, id: string) {
    const quiz = await this.prisma.practiceQuiz.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: [{ module: 'asc' }, { order: 'asc' }],
          include: { options: { orderBy: { order: 'asc' } } },
        },
        createdBy: { include: { user: { select: { name: true } } } },
        _count: { select: { attempts: true } },
      },
    });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Practice quiz not found');
    }
    const { createdBy, _count, ...rest } = quiz;
    return {
      ...rest,
      createdByName: createdBy.user.name,
      attemptCount: _count.attempts,
      averageScorePercent: await this.averageScorePercentFor(id),
    };
  }

  async create(tenantId: string, createdByMembershipId: string, dto: CreatePracticeQuizDto) {
    const mode = dto.mode ?? PracticeQuizMode.FIXED;
    const { bankModuleTargets, bankDifficultyRatio } = resolveBankSettings(
      mode,
      dto.bankModuleTargets as BankModuleTargets | undefined,
      dto.bankDifficultyRatio as BankDifficultyRatio | undefined,
    );
    const quiz = await this.prisma.practiceQuiz.create({
      data: {
        tenantId,
        createdByMembershipId,
        title: dto.title,
        description: dto.description,
        maxAttempts: dto.maxAttempts,
        shuffleQuestions: dto.shuffleQuestions ?? false,
        shuffleOptions: dto.shuffleOptions ?? false,
        showDifficultyToStudents: dto.showDifficultyToStudents ?? false,
        availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : undefined,
        availableUntil: dto.availableUntil ? new Date(dto.availableUntil) : undefined,
        passMarkPercent: dto.passMarkPercent,
        mode,
        bankModuleTargets,
        bankDifficultyRatio,
      },
    });
    await this.auditLog.log(tenantId, quiz.id, createdByMembershipId, 'PRACTICE_QUIZ_CREATED');
    return quiz;
  }

  private async getOwnPracticeQuiz(tenantId: string, id: string) {
    const quiz = await this.prisma.practiceQuiz.findUnique({ where: { id } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Practice quiz not found');
    }
    return quiz;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdatePracticeQuizDto,
    actorMembershipId?: string,
  ) {
    const quiz = await this.getOwnPracticeQuiz(tenantId, id);
    if (quiz.status !== QuizStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT practice quizzes can be edited');
    }
    if ((dto.bankModuleTargets || dto.bankDifficultyRatio) && quiz.mode !== PracticeQuizMode.BANK) {
      throw new BadRequestException(
        'bankModuleTargets/bankDifficultyRatio only apply to a question-bank quiz',
      );
    }
    let bankModuleTargets: Prisma.InputJsonValue | undefined;
    let bankDifficultyRatio: Prisma.InputJsonValue | undefined;
    if (quiz.mode === PracticeQuizMode.BANK && (dto.bankModuleTargets || dto.bankDifficultyRatio)) {
      const resolved = resolveBankSettings(
        PracticeQuizMode.BANK,
        (dto.bankModuleTargets as BankModuleTargets | undefined) ??
          (quiz.bankModuleTargets as BankModuleTargets),
        (dto.bankDifficultyRatio as BankDifficultyRatio | undefined) ??
          (quiz.bankDifficultyRatio as BankDifficultyRatio),
      );
      bankModuleTargets = resolved.bankModuleTargets;
      bankDifficultyRatio = resolved.bankDifficultyRatio;
    }
    const updated = await this.prisma.practiceQuiz.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        maxAttempts: dto.maxAttempts,
        shuffleQuestions: dto.shuffleQuestions,
        shuffleOptions: dto.shuffleOptions,
        showDifficultyToStudents: dto.showDifficultyToStudents,
        availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : undefined,
        availableUntil: dto.availableUntil ? new Date(dto.availableUntil) : undefined,
        passMarkPercent: dto.passMarkPercent,
        bankModuleTargets,
        bankDifficultyRatio,
      },
    });
    await this.auditLog.log(
      tenantId,
      id,
      actorMembershipId ?? null,
      'SETTINGS_UPDATED',
    );
    return updated;
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: QuizStatus,
    actorMembershipId?: string,
  ) {
    const quiz = await this.getOwnPracticeQuiz(tenantId, id);
    const allowed = ALLOWED_TRANSITIONS[quiz.status];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition a ${quiz.status} practice quiz to ${status}`,
      );
    }
    if (status === QuizStatus.PUBLISHED || status === QuizStatus.SCHEDULED) {
      if (status === QuizStatus.SCHEDULED) {
        if (!quiz.availableFrom || quiz.availableFrom.getTime() <= Date.now()) {
          throw new BadRequestException(
            'Set an "available from" date/time in the future before scheduling',
          );
        }
      }
      const verb = status === QuizStatus.PUBLISHED ? 'publish' : 'schedule';
      if (quiz.mode === PracticeQuizMode.BANK) {
        const shortfalls = await validateBankCoverage(
          this.prisma,
          id,
          quiz.bankModuleTargets as BankModuleTargets,
          quiz.bankDifficultyRatio as BankDifficultyRatio,
        );
        if (shortfalls.length > 0) {
          throw new BadRequestException(
            `Cannot ${verb} — the question bank doesn't have enough questions yet: ${formatShortfalls(shortfalls)}`,
          );
        }
      } else {
        const byModule = await this.prisma.practiceQuestion.groupBy({
          by: ['module'],
          where: { quizId: id },
          _count: { _all: true },
        });
        const withQuestions = new Set<string>(byModule.map((g) => g.module as string));
        const emptyModules = QUIZ_MODULE_SEQUENCE.filter((m) => !withQuestions.has(m));
        if (emptyModules.length > 0) {
          throw new BadRequestException(
            `Cannot ${verb} a practice quiz with no questions in: ${emptyModules.join(', ')}`,
          );
        }
      }
    }
    const updated = await this.prisma.practiceQuiz.update({ where: { id }, data: { status } });
    // ARCHIVED -> DRAFT is a restore, not an unpublish (which is
    // PUBLISHED -> DRAFT) — flag it distinctly so the activity feed reads
    // "Restored", not the misleading "Unpublished".
    const auditDetail =
      quiz.status === QuizStatus.ARCHIVED && status === QuizStatus.DRAFT ? 'RESTORED' : status;
    await this.auditLog.log(
      tenantId,
      id,
      actorMembershipId ?? null,
      'STATUS_CHANGED',
      auditDetail,
    );
    return updated;
  }

  /** Promotes practice quizzes whose scheduled availableFrom time has arrived. Called by PracticeQuizSchedulerService's cron tick. */
  async publishDueScheduledQuizzes() {
    const due = await this.prisma.practiceQuiz.findMany({
      where: { status: QuizStatus.SCHEDULED, availableFrom: { lte: new Date() } },
      select: { id: true, tenantId: true },
    });
    if (due.length === 0) return 0;
    await this.prisma.practiceQuiz.updateMany({
      where: { id: { in: due.map((q) => q.id) } },
      data: { status: QuizStatus.PUBLISHED },
    });
    await Promise.all(
      due.map((q) =>
        this.auditLog.log(q.tenantId, q.id, null, 'STATUS_CHANGED', 'PUBLISHED'),
      ),
    );
    return due.length;
  }

  async remove(tenantId: string, id: string) {
    await this.getOwnPracticeQuiz(tenantId, id);
    await this.prisma.practiceQuiz.delete({ where: { id } });
    return { id };
  }

  /** Clones a practice quiz's settings and questions/options into a new DRAFT practice quiz. */
  async duplicate(tenantId: string, actorMembershipId: string, id: string) {
    const source = await this.prisma.practiceQuiz.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: [{ module: 'asc' }, { order: 'asc' }],
          include: { options: { orderBy: { order: 'asc' } } },
        },
      },
    });
    if (!source || source.tenantId !== tenantId) {
      throw new NotFoundException('Practice quiz not found');
    }

    const copy = await this.prisma.practiceQuiz.create({
      data: {
        tenantId,
        createdByMembershipId: actorMembershipId,
        title: `${source.title} (Copy)`,
        description: source.description,
        maxAttempts: source.maxAttempts,
        shuffleQuestions: source.shuffleQuestions,
        shuffleOptions: source.shuffleOptions,
        showDifficultyToStudents: source.showDifficultyToStudents,
        passMarkPercent: source.passMarkPercent ?? undefined,
        status: QuizStatus.DRAFT,
        mode: source.mode,
        bankModuleTargets: source.bankModuleTargets ?? undefined,
        bankDifficultyRatio: source.bankDifficultyRatio ?? undefined,
        questions: {
          create: source.questions.map((q) => ({
            module: q.module,
            type: q.type,
            prompt: q.prompt,
            points: q.points,
            order: q.order,
            config: q.config ?? {},
            difficulty: q.difficulty,
            attachmentKey: q.attachmentKey,
            attachmentFilename: q.attachmentFilename,
            attachmentMimeType: q.attachmentMimeType,
            imageKey: q.imageKey,
            imageFilename: q.imageFilename,
            imageMimeType: q.imageMimeType,
            options: {
              create: q.options.map((o) => ({
                text: o.text,
                isCorrect: o.isCorrect,
                order: o.order,
                imageKey: o.imageKey,
                imageFilename: o.imageFilename,
                imageMimeType: o.imageMimeType,
              })),
            },
          })),
        },
      },
    });
    await this.auditLog.log(
      tenantId,
      copy.id,
      actorMembershipId,
      'PRACTICE_QUIZ_CREATED',
      `Duplicated from "${source.title}"`,
    );
    return copy;
  }

  /** Every attempt on a practice quiz, for the admin-facing Results tab. */
  async results(tenantId: string, id: string) {
    await this.getOwnPracticeQuiz(tenantId, id);
    const attempts = await this.prisma.practiceAttempt.findMany({
      where: { quizId: id },
      include: { student: { include: { user: { select: { name: true, email: true } } } } },
      orderBy: { startedAt: 'desc' },
    });
    return attempts.map((a) => ({
      attemptId: a.id,
      studentName: a.student.user.name,
      studentEmail: a.student.user.email,
      attemptNumber: a.attemptNumber,
      status: a.status,
      score: a.score,
      maxScore: a.maxScore,
      percent:
        a.status === 'GRADED' && a.score != null && a.maxScore != null
          ? Math.round((Number(a.score) / Number(a.maxScore)) * 10000) / 100
          : null,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      sessionActive: isSessionLive(a.lockSessionId, a.lastHeartbeatAt),
    }));
  }

  /** Full per-question breakdown of one attempt, for the admin's manual
   * score-override view — unlike the student-facing attempt view, this is
   * never sanitized (the admin needs to see the correct answers). */
  async attemptDetail(tenantId: string, quizId: string, attemptId: string) {
    const quiz = await this.getOwnPracticeQuiz(tenantId, quizId);
    const attempt = await this.prisma.practiceAttempt.findUnique({
      where: { id: attemptId },
      include: {
        student: { include: { user: { select: { name: true, email: true } } } },
        responses: true,
      },
    });
    if (!attempt || attempt.quizId !== quizId) {
      throw new NotFoundException('Attempt not found');
    }

    // BANK mode: every attempt has its own frozen snapshot, fully decoupled
    // from the live PracticeQuestion bank — read from that instead, so this
    // view (and thus the student's own review, which uses the same shape)
    // stays correct forever even after the admin edits/deletes bank
    // questions later.
    if (quiz.mode === PracticeQuizMode.BANK) {
      const snapshotQuestions = await this.prisma.practiceAttemptQuestion.findMany({
        where: { attemptId },
        orderBy: [{ module: 'asc' }, { order: 'asc' }],
        include: { options: { orderBy: { order: 'asc' } }, response: true },
      });
      return {
        attemptId: attempt.id,
        studentName: attempt.student.user.name,
        studentEmail: attempt.student.user.email,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        score: attempt.score,
        maxScore: attempt.maxScore,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        sessionActive: isSessionLive(attempt.lockSessionId, attempt.lastHeartbeatAt),
        questions: snapshotQuestions.map((q) => ({
          questionId: q.id,
          module: q.module,
          type: q.type,
          prompt: q.prompt,
          points: q.points,
          difficulty: q.difficulty,
          options: q.options.map((o) => ({
            id: o.id,
            text: o.text,
            isCorrect: o.isCorrect,
            imageFilename: o.imageFilename,
            imageMimeType: o.imageMimeType,
          })),
          attachmentFilename: q.attachmentFilename,
          attachmentMimeType: q.attachmentMimeType,
          imageFilename: q.imageFilename,
          imageMimeType: q.imageMimeType,
          responseId: q.response?.id ?? null,
          answer: q.response?.answer ?? null,
          fileKey: null,
          awardedPoints: q.response?.awardedPoints ?? null,
          feedback: null,
          autoGraded: true,
        })),
      };
    }

    const questions = await this.prisma.practiceQuestion.findMany({
      where: { quizId },
      orderBy: [{ module: 'asc' }, { order: 'asc' }],
      include: { options: { orderBy: { order: 'asc' } } },
    });
    const responseByQuestion = new Map(attempt.responses.map((r) => [r.questionId, r]));

    return {
      attemptId: attempt.id,
      studentName: attempt.student.user.name,
      studentEmail: attempt.student.user.email,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      score: attempt.score,
      maxScore: attempt.maxScore,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      sessionActive: isSessionLive(attempt.lockSessionId, attempt.lastHeartbeatAt),
      questions: questions.map((q) => {
        const response = responseByQuestion.get(q.id);
        return {
          questionId: q.id,
          module: q.module,
          type: q.type,
          prompt: q.prompt,
          points: q.points,
          difficulty: q.difficulty,
          options: q.options.map((o) => ({
            id: o.id,
            text: o.text,
            isCorrect: o.isCorrect,
            imageFilename: o.imageFilename,
            imageMimeType: o.imageMimeType,
          })),
          attachmentFilename: q.attachmentFilename,
          attachmentMimeType: q.attachmentMimeType,
          imageFilename: q.imageFilename,
          imageMimeType: q.imageMimeType,
          responseId: response?.id ?? null,
          answer: response?.answer ?? null,
          fileKey: response?.fileKey ?? null,
          awardedPoints: response?.awardedPoints ?? null,
          feedback: response?.feedback ?? null,
          autoGraded: response?.autoGraded ?? false,
        };
      }),
    };
  }

  /** Question-level reference-document view URL for the admin's
   * attempt-detail/grading view — dual-mode like getAttemptQuestionImageUrl. */
  async getAttemptQuestionAttachmentUrl(
    tenantId: string,
    quizId: string,
    attemptId: string,
    questionId: string,
  ) {
    const quiz = await this.getOwnPracticeQuiz(tenantId, quizId);
    const attempt = await this.prisma.practiceAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.quizId !== quizId) {
      throw new NotFoundException('Attempt not found');
    }

    const question =
      quiz.mode === PracticeQuizMode.BANK
        ? await this.prisma.practiceAttemptQuestion.findUnique({ where: { id: questionId } })
        : await this.prisma.practiceQuestion.findUnique({ where: { id: questionId } });
    const belongsToAttempt =
      quiz.mode === PracticeQuizMode.BANK
        ? (question as { attemptId?: string } | null)?.attemptId === attemptId
        : (question as { quizId?: string } | null)?.quizId === quizId;
    if (!question || !belongsToAttempt) {
      throw new NotFoundException('Question not found on this attempt');
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

  /** Question-level image view URL for the admin's attempt-detail/grading
   * view — dual-mode like PracticeAttemptsService.getImageUrl (BANK reads
   * the frozen per-attempt snapshot, FIXED reads the live question), but
   * tenant/admin-authorized instead of student-authorized. */
  async getAttemptQuestionImageUrl(
    tenantId: string,
    quizId: string,
    attemptId: string,
    questionId: string,
  ) {
    const quiz = await this.getOwnPracticeQuiz(tenantId, quizId);
    const attempt = await this.prisma.practiceAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.quizId !== quizId) {
      throw new NotFoundException('Attempt not found');
    }

    const question =
      quiz.mode === PracticeQuizMode.BANK
        ? await this.prisma.practiceAttemptQuestion.findUnique({ where: { id: questionId } })
        : await this.prisma.practiceQuestion.findUnique({ where: { id: questionId } });
    const belongsToAttempt =
      quiz.mode === PracticeQuizMode.BANK
        ? (question as { attemptId?: string } | null)?.attemptId === attemptId
        : (question as { quizId?: string } | null)?.quizId === quizId;
    if (!question || !belongsToAttempt) {
      throw new NotFoundException('Question not found on this attempt');
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

  /** Option-level counterpart of getAttemptQuestionImageUrl. */
  async getAttemptOptionImageUrl(
    tenantId: string,
    quizId: string,
    attemptId: string,
    questionId: string,
    optionId: string,
  ) {
    const quiz = await this.getOwnPracticeQuiz(tenantId, quizId);
    const attempt = await this.prisma.practiceAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.quizId !== quizId) {
      throw new NotFoundException('Attempt not found');
    }

    let option: { imageKey: string | null; imageFilename: string | null; imageMimeType: string | null } | null;
    if (quiz.mode === PracticeQuizMode.BANK) {
      const row = await this.prisma.practiceAttemptQuestionOption.findUnique({
        where: { id: optionId },
        include: { attemptQuestion: true },
      });
      option =
        row && row.attemptQuestionId === questionId && row.attemptQuestion.attemptId === attemptId
          ? row
          : null;
    } else {
      const row = await this.prisma.practiceQuestionOption.findUnique({
        where: { id: optionId },
        include: { question: true },
      });
      option = row && row.questionId === questionId && row.question.quizId === quizId ? row : null;
    }
    if (!option) {
      throw new NotFoundException('Option not found on this attempt');
    }
    if (!option.imageKey) {
      throw new NotFoundException('This option has no image');
    }

    const viewUrl = await this.storage.getViewUrl(option.imageKey, option.imageFilename ?? 'image');
    return { viewUrl, filename: option.imageFilename, mimeType: option.imageMimeType };
  }

  /** Manual escape hatch for a stuck session lock — e.g. a student's device
   * crashed mid-test and its heartbeats stopped, but hasn't yet gone stale
   * on its own. Clearing the lock lets them log back in and resume
   * immediately instead of waiting out SESSION_LOCK_TIMEOUT_MS. Only
   * touches the lock, never the attempt's status/answers. */
  async releaseAttemptSession(
    tenantId: string,
    quizId: string,
    attemptId: string,
    actorMembershipId: string,
  ) {
    await this.getOwnPracticeQuiz(tenantId, quizId);
    const attempt = await this.prisma.practiceAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.quizId !== quizId) {
      throw new NotFoundException('Attempt not found');
    }
    await this.prisma.practiceAttempt.update({
      where: { id: attemptId },
      data: { lockSessionId: null, lockedAt: null, lastHeartbeatAt: null },
    });
    await this.auditLog.log(
      tenantId,
      quizId,
      actorMembershipId,
      'SESSION_RELEASED',
      `Released a stuck test session for attempt #${attempt.attemptNumber}`,
    );
    return { ok: true };
  }
}
