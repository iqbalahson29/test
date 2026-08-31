import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { QuizStatus } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { SESSION_LOCK_TIMEOUT_MS } from '../common/session-lock.constants';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';

/** Mirrors AttemptsService's own lock-liveness check, for the read-only
 * teacher-facing "is this attempt active right now" indicator. */
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
export class QuizzesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async averageScorePercentFor(quizId: string): Promise<number | null> {
    const graded = await this.prisma.attempt.findMany({
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
    const quizzes = await this.prisma.quiz.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { questions: true, attempts: true } } },
    });

    return Promise.all(
      quizzes.map(async (q) => ({
        id: q.id,
        title: q.title,
        status: q.status,
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
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: { options: { orderBy: { order: 'asc' } } },
        },
        createdBy: { include: { user: { select: { name: true } } } },
        _count: { select: { attempts: true } },
      },
    });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Quiz not found');
    }
    const { createdBy, _count, ...rest } = quiz;
    return {
      ...rest,
      createdByName: createdBy.user.name,
      attemptCount: _count.attempts,
      averageScorePercent: await this.averageScorePercentFor(id),
    };
  }

  async create(tenantId: string, createdByMembershipId: string, dto: CreateQuizDto) {
    const quiz = await this.prisma.quiz.create({
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
    await this.auditLog.log(tenantId, quiz.id, createdByMembershipId, 'QUIZ_CREATED');
    return quiz;
  }

  private async getOwnQuiz(tenantId: string, id: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Quiz not found');
    }
    return quiz;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateQuizDto,
    actorMembershipId?: string,
  ) {
    const quiz = await this.getOwnQuiz(tenantId, id);
    if (quiz.status !== QuizStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT quizzes can be edited');
    }
    const updated = await this.prisma.quiz.update({
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
    if (status === QuizStatus.SCHEDULED) {
      if (!quiz.availableFrom || quiz.availableFrom.getTime() <= Date.now()) {
        throw new BadRequestException(
          'Set an "available from" date/time in the future before scheduling',
        );
      }
      const questionCount = await this.prisma.question.count({
        where: { quizId: id },
      });
      if (questionCount === 0) {
        throw new BadRequestException(
          'Cannot schedule a quiz with no questions',
        );
      }
    }
    const updated = await this.prisma.quiz.update({ where: { id }, data: { status } });
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

  /** Promotes quizzes whose scheduled availableFrom time has arrived. Called by QuizSchedulerService's cron tick. */
  async publishDueScheduledQuizzes() {
    const due = await this.prisma.quiz.findMany({
      where: { status: QuizStatus.SCHEDULED, availableFrom: { lte: new Date() } },
      select: { id: true, tenantId: true },
    });
    if (due.length === 0) return 0;
    await this.prisma.quiz.updateMany({
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
    await this.getOwnQuiz(tenantId, id);
    await this.prisma.quiz.delete({ where: { id } });
    return { id };
  }

  /** Clones a quiz's settings and questions/options into a new DRAFT quiz. */
  async duplicate(tenantId: string, actorMembershipId: string, id: string) {
    const source = await this.prisma.quiz.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } } },
    });
    if (!source || source.tenantId !== tenantId) {
      throw new NotFoundException('Quiz not found');
    }

    const copy = await this.prisma.quiz.create({
      data: {
        tenantId,
        createdByMembershipId: actorMembershipId,
        title: `${source.title} (Copy)`,
        description: source.description,
        timeLimitSec: source.timeLimitSec,
        maxAttempts: source.maxAttempts,
        shuffleQuestions: source.shuffleQuestions,
        shuffleOptions: source.shuffleOptions,
        passMarkPercent: source.passMarkPercent ?? undefined,
        status: QuizStatus.DRAFT,
        questions: {
          create: source.questions.map((q) => ({
            type: q.type,
            prompt: q.prompt,
            points: q.points,
            order: q.order,
            config: q.config ?? {},
            attachmentKey: q.attachmentKey,
            attachmentFilename: q.attachmentFilename,
            attachmentMimeType: q.attachmentMimeType,
            options: {
              create: q.options.map((o) => ({
                text: o.text,
                isCorrect: o.isCorrect,
                order: o.order,
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
      'QUIZ_CREATED',
      `Duplicated from "${source.title}"`,
    );
    return copy;
  }

  /** Every attempt on a quiz, for the admin-facing Results tab. */
  async results(tenantId: string, id: string) {
    await this.getOwnQuiz(tenantId, id);
    const attempts = await this.prisma.attempt.findMany({
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
    await this.getOwnQuiz(tenantId, quizId);
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        student: { include: { user: { select: { name: true, email: true } } } },
        responses: true,
      },
    });
    if (!attempt || attempt.quizId !== quizId) {
      throw new NotFoundException('Attempt not found');
    }

    const questions = await this.prisma.question.findMany({
      where: { quizId },
      orderBy: { order: 'asc' },
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
          type: q.type,
          prompt: q.prompt,
          points: q.points,
          options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
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
    await this.getOwnQuiz(tenantId, quizId);
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.quizId !== quizId) {
      throw new NotFoundException('Attempt not found');
    }
    await this.prisma.attempt.update({
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
