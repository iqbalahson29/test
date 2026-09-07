import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttemptStatus,
  Prisma,
  QuestionType,
  QuizModule as PrismaQuizModule,
  QuizStatus,
} from '@prisma/client';
import {
  QUIZ_MODULE_SEQUENCE,
  QUIZ_MODULE_TIME_LIMIT_SEC,
  QuizModule as SatModule,
} from '@quiz-platform/shared';
import { SESSION_LOCK_TIMEOUT_MS } from '../common/session-lock.constants';
import { GradingService } from '../grading/grading.service';
import { NotificationsService } from '../notifications/notifications.service';
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
    private readonly notifications: NotificationsService,
  ) {}

  /** Prisma's generated QuizModule enum and the shared package's QuizModule
   * type carry identical string values but are nominally distinct types to
   * TypeScript — this is a zero-cost bridge between them. */
  private toSatModule(module: PrismaQuizModule): SatModule {
    return module as unknown as SatModule;
  }

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
              orderBy: [{ module: 'asc' }, { order: 'asc' }],
              include: { options: { orderBy: { order: 'asc' } } },
            },
          },
        },
        responses: true,
        modules: { orderBy: { startedAt: 'asc' } },
      },
    });
    if (!attempt || attempt.studentMembershipId !== studentMembershipId) {
      throw new NotFoundException('Attempt not found');
    }

    const responseByQuestion = new Map(
      attempt.responses.map((r) => [r.questionId, r]),
    );

    const activeProgress = attempt.modules.find((m) => !m.submittedAt);
    const completedModules = attempt.modules
      .filter((m) => m.submittedAt)
      .map((m) => this.toSatModule(m.module));

    // While the attempt is in progress, only the active module's questions
    // are served — and between modules (active module just completed, next
    // one not started yet) none are, so a student can never see a future
    // module's questions early. Only once the whole attempt is
    // SUBMITTED/GRADED does the student review every question they answered.
    const visibleQuestions =
      attempt.status === AttemptStatus.IN_PROGRESS
        ? activeProgress
          ? attempt.quiz.questions.filter((q) => q.module === activeProgress.module)
          : []
        : attempt.quiz.questions;

    return {
      id: attempt.id,
      quizId: attempt.quizId,
      quizTitle: attempt.quiz.title,
      currentModule: activeProgress ? this.toSatModule(activeProgress.module) : null,
      moduleDeadlineAt: activeProgress
        ? new Date(
            activeProgress.startedAt.getTime() +
              QUIZ_MODULE_TIME_LIMIT_SEC[this.toSatModule(activeProgress.module)] * 1000,
          )
        : null,
      completedModules,
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
      questions: visibleQuestions.map((q) => {
        const sanitized = sanitizeQuestion(q);
        const response = responseByQuestion.get(q.id);
        return {
          ...sanitized,
          module: this.toSatModule(q.module),
          difficulty: attempt.quiz.showDifficultyToStudents ? sanitized.difficulty : null,
          answer: response?.answer ?? null,
          fileKey: response?.fileKey ?? null,
          awardedPoints: response?.awardedPoints ?? null,
          feedback: response?.feedback ?? null,
        };
      }),
    };
  }

  /** If the active module's deadline has passed, closes it out
   * (`autoSubmitted: true`) — and finalizes the whole attempt if it was the
   * last module — before the caller proceeds. This is what makes the fixed
   * per-module time limits server-enforced rather than merely displayed:
   * it runs on every attempt-mutating call, so a module can't be worked on
   * past its deadline just because the client's local timer died. */
  private async enforceModuleDeadline(attemptId: string): Promise<void> {
    const active = await this.prisma.attemptModuleProgress.findFirst({
      where: { attemptId, submittedAt: null },
    });
    if (!active) return;

    const limitMs = QUIZ_MODULE_TIME_LIMIT_SEC[this.toSatModule(active.module)] * 1000;
    if (Date.now() - active.startedAt.getTime() < limitMs) return;

    await this.prisma.attemptModuleProgress.update({
      where: { id: active.id },
      data: { submittedAt: new Date(), autoSubmitted: true },
    });

    const isLastModule =
      this.toSatModule(active.module) === QUIZ_MODULE_SEQUENCE[QUIZ_MODULE_SEQUENCE.length - 1];
    if (isLastModule) {
      await this.finalizeAttempt(attemptId);
    }
  }

  /** Flips the attempt to SUBMITTED, clears the session lock, grades it, and
   * notifies — shared by the last module's explicit completion and by
   * deadline-expiry auto-completion of the last module. */
  private async finalizeAttempt(attemptId: string): Promise<void> {
    const attempt = await this.prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    await this.prisma.attempt.update({
      where: { id: attemptId },
      data: {
        status: AttemptStatus.SUBMITTED,
        submittedAt: new Date(),
        lockSessionId: null,
        lockedAt: null,
        lastHeartbeatAt: null,
      },
    });
    await this.grading.gradeAttempt(attemptId);

    const quiz = await this.prisma.quiz.findUniqueOrThrow({ where: { id: attempt.quizId } });
    const graded = await this.prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    if (graded.status === AttemptStatus.GRADED) {
      await this.notifications.create(attempt.studentMembershipId, {
        tenantId: quiz.tenantId,
        type: 'RESPONSE_GRADED',
        title: 'Quiz graded',
        body: `"${quiz.title}" has been graded.`,
        link: `/student/attempts/${attemptId}`,
      });
    } else {
      await this.notifications.notifyAdmins(quiz.tenantId, {
        type: 'GRADING_PENDING',
        title: 'Submission needs grading',
        body: `A response to "${quiz.title}" is waiting to be graded.`,
        link: `/teacher/quizzes/${quiz.id}/grading`,
      });
    }
  }

  /** True when `attempt`'s session lock is held by a *different*, still-live
   * session — i.e. some other device is actively taking this attempt right
   * now. A missing lock, an expired one (no heartbeat within
   * SESSION_LOCK_TIMEOUT_MS), or one already owned by `sessionId` are all
   * fair game to (re)claim. */
  private isLockLiveAndForeign(
    attempt: { lockSessionId: string | null; lastHeartbeatAt: Date | null },
    sessionId: string,
  ): boolean {
    if (!attempt.lockSessionId || attempt.lockSessionId === sessionId) {
      return false;
    }
    if (!attempt.lastHeartbeatAt) {
      return false;
    }
    return attempt.lastHeartbeatAt.getTime() > Date.now() - SESSION_LOCK_TIMEOUT_MS;
  }

  /** Claims (or refreshes) the session lock for `sessionId`. Called on
   * start/resume and on every subsequent write to the attempt, so ordinary
   * activity — not just the dedicated heartbeat endpoint — keeps the lock
   * alive. */
  private touchLock(attemptId: string, sessionId: string) {
    return this.prisma.attempt.update({
      where: { id: attemptId },
      data: { lockSessionId: sessionId, lockedAt: new Date(), lastHeartbeatAt: new Date() },
    });
  }

  async start(
    tenantId: string,
    studentMembershipId: string,
    quizId: string,
    sessionId: string,
  ) {
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
      if (this.isLockLiveAndForeign(existingInProgress, sessionId)) {
        throw new ForbiddenException(
          'This test is currently active in another session',
        );
      }
      await this.touchLock(existingInProgress.id, sessionId);
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

    try {
      const attempt = await this.prisma.$transaction(async (tx) => {
        const created = await tx.attempt.create({
          data: {
            quizId,
            studentMembershipId,
            attemptNumber: priorCount + 1,
            status: AttemptStatus.IN_PROGRESS,
            lockSessionId: sessionId,
            lockedAt: new Date(),
            lastHeartbeatAt: new Date(),
          },
        });
        await tx.attemptModuleProgress.create({
          data: {
            attemptId: created.id,
            module: QUIZ_MODULE_SEQUENCE[0] as unknown as PrismaQuizModule,
            startedAt: new Date(),
          },
        });
        return created;
      });
      return this.buildAttemptView(attempt.id, studentMembershipId);
    } catch (err) {
      // Two concurrent `start` calls (double-click, flaky connection) can both
      // pass the checks above and race on @@unique([quizId, studentMembershipId,
      // attemptNumber]) — the loser joins the winner's attempt instead of 500ing.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const concurrent = await this.prisma.attempt.findFirst({
          where: { quizId, studentMembershipId, status: AttemptStatus.IN_PROGRESS },
        });
        if (concurrent) {
          await this.touchLock(concurrent.id, sessionId);
          return this.buildAttemptView(concurrent.id, studentMembershipId);
        }
      }
      throw err;
    }
  }

  /** Pinged periodically by the test-taking screen to prove this session is
   * still the one actively taking the attempt — see SESSION_LOCK_TIMEOUT_MS. */
  async heartbeat(studentMembershipId: string, attemptId: string, sessionId: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.studentMembershipId !== studentMembershipId) {
      throw new NotFoundException('Attempt not found');
    }
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      return { ok: true };
    }
    if (this.isLockLiveAndForeign(attempt, sessionId)) {
      throw new ForbiddenException('This test is currently active in another session');
    }
    await this.enforceModuleDeadline(attemptId);
    await this.touchLock(attemptId, sessionId);
    return { ok: true };
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
    sessionId: string,
  ) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.studentMembershipId !== studentMembershipId) {
      throw new NotFoundException('Attempt not found');
    }
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Attempt is no longer in progress');
    }
    if (this.isLockLiveAndForeign(attempt, sessionId)) {
      throw new ForbiddenException('This test is currently active in another session');
    }
    await this.enforceModuleDeadline(attemptId);

    const activeModule = await this.prisma.attemptModuleProgress.findFirst({
      where: { attemptId, submittedAt: null },
    });
    if (!activeModule) {
      throw new BadRequestException('The current module has ended');
    }

    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question || question.quizId !== attempt.quizId || question.module !== activeModule.module) {
      throw new NotFoundException('Question not found on this attempt');
    }

    const answer =
      dto.answer === undefined ? undefined : (dto.answer as Prisma.InputJsonValue);

    await this.prisma.response.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      update: { answer, fileKey: dto.fileKey },
      create: { attemptId, questionId, answer, fileKey: dto.fileKey },
    });
    await this.touchLock(attemptId, sessionId);
    return { ok: true };
  }

  async getUploadUrl(
    studentMembershipId: string,
    attemptId: string,
    questionId: string,
    dto: RequestUploadUrlDto,
    sessionId: string,
  ) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.studentMembershipId !== studentMembershipId) {
      throw new NotFoundException('Attempt not found');
    }
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Attempt is no longer in progress');
    }
    if (this.isLockLiveAndForeign(attempt, sessionId)) {
      throw new ForbiddenException('This test is currently active in another session');
    }
    await this.enforceModuleDeadline(attemptId);

    const activeModule = await this.prisma.attemptModuleProgress.findFirst({
      where: { attemptId, submittedAt: null },
    });
    if (!activeModule) {
      throw new BadRequestException('The current module has ended');
    }

    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question || question.quizId !== attempt.quizId || question.module !== activeModule.module) {
      throw new NotFoundException('Question not found on this attempt');
    }
    if (question.type !== QuestionType.FILE_UPLOAD) {
      throw new BadRequestException('This question does not accept file uploads');
    }

    const safeFilename = dto.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileKey = `attempts/${attemptId}/${questionId}/${randomUUID()}-${safeFilename}`;
    const uploadUrl = await this.storage.getUploadUrl(fileKey, dto.contentType);
    await this.touchLock(attemptId, sessionId);
    return { uploadUrl, fileKey };
  }

  async getAttachmentUrl(
    studentMembershipId: string,
    attemptId: string,
    questionId: string,
  ) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.studentMembershipId !== studentMembershipId) {
      throw new NotFoundException('Attempt not found');
    }

    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question || question.quizId !== attempt.quizId) {
      throw new NotFoundException('Question not found on this attempt');
    }
    if (!question.attachmentKey) {
      throw new NotFoundException('This question has no attachment');
    }

    const viewUrl = await this.storage.getViewUrl(
      question.attachmentKey,
      question.attachmentFilename ?? 'document',
    );
    return { viewUrl };
  }

  async getImageUrl(studentMembershipId: string, attemptId: string, questionId: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.studentMembershipId !== studentMembershipId) {
      throw new NotFoundException('Attempt not found');
    }

    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question || question.quizId !== attempt.quizId) {
      throw new NotFoundException('Question not found on this attempt');
    }
    if (!question.imageKey) {
      throw new NotFoundException('This question has no image');
    }

    const viewUrl = await this.storage.getViewUrl(
      question.imageKey,
      question.imageFilename ?? 'image',
    );
    return { viewUrl };
  }

  async getOptionImageUrl(
    studentMembershipId: string,
    attemptId: string,
    questionId: string,
    optionId: string,
  ) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.studentMembershipId !== studentMembershipId) {
      throw new NotFoundException('Attempt not found');
    }

    const option = await this.prisma.questionOption.findUnique({
      where: { id: optionId },
      include: { question: true },
    });
    if (
      !option ||
      option.questionId !== questionId ||
      option.question.quizId !== attempt.quizId
    ) {
      throw new NotFoundException('Option not found on this attempt');
    }
    if (!option.imageKey) {
      throw new NotFoundException('This option has no image');
    }

    const viewUrl = await this.storage.getViewUrl(option.imageKey, option.imageFilename ?? 'image');
    return { viewUrl };
  }

  /** Ends the currently-active module. If it was the last module in
   * QUIZ_MODULE_SEQUENCE, this finalizes the whole attempt (grades it,
   * notifies); otherwise the attempt just has no active module until the
   * student calls beginNextModule — this is also the point where the client
   * shows the inter-module ("take a break" for the R&W->Math boundary,
   * otherwise immediate) screen. */
  async completeCurrentModule(studentMembershipId: string, attemptId: string, sessionId: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.studentMembershipId !== studentMembershipId) {
      throw new NotFoundException('Attempt not found');
    }
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Attempt is not in progress');
    }
    if (this.isLockLiveAndForeign(attempt, sessionId)) {
      throw new ForbiddenException('This test is currently active in another session');
    }
    await this.enforceModuleDeadline(attemptId);

    const active = await this.prisma.attemptModuleProgress.findFirst({
      where: { attemptId, submittedAt: null },
    });
    if (active) {
      await this.prisma.attemptModuleProgress.update({
        where: { id: active.id },
        data: { submittedAt: new Date() },
      });
      const isLastModule =
        this.toSatModule(active.module) ===
        QUIZ_MODULE_SEQUENCE[QUIZ_MODULE_SEQUENCE.length - 1];
      if (isLastModule) {
        await this.finalizeAttempt(attemptId);
      }
    }
    await this.touchLock(attemptId, sessionId);

    return this.buildAttemptView(attemptId, studentMembershipId);
  }

  /** Starts the next module in sequence once the previous one is complete —
   * the call the break/continue screen triggers. Nothing here distinguishes
   * the R&W->Math boundary from any other; the break is purely a client-side
   * choice of when to make this call. */
  async beginNextModule(studentMembershipId: string, attemptId: string, sessionId: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.studentMembershipId !== studentMembershipId) {
      throw new NotFoundException('Attempt not found');
    }
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Attempt is not in progress');
    }
    if (this.isLockLiveAndForeign(attempt, sessionId)) {
      throw new ForbiddenException('This test is currently active in another session');
    }

    const progressRows = await this.prisma.attemptModuleProgress.findMany({
      where: { attemptId },
    });
    if (progressRows.some((p) => !p.submittedAt)) {
      throw new BadRequestException('The current module has not been completed yet');
    }
    const completed = new Set(progressRows.map((p) => this.toSatModule(p.module)));
    const next = QUIZ_MODULE_SEQUENCE.find((m) => !completed.has(m));
    if (!next) {
      throw new BadRequestException('All modules are already complete');
    }

    await this.prisma.attemptModuleProgress.create({
      data: {
        attemptId,
        module: next as unknown as PrismaQuizModule,
        startedAt: new Date(),
      },
    });
    await this.touchLock(attemptId, sessionId);

    return this.buildAttemptView(attemptId, studentMembershipId);
  }
}
