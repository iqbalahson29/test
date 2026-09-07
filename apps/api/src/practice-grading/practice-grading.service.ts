import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, PracticeQuizMode, Prisma, QuestionType } from '@prisma/client';
import { AUTO_GRADABLE_TYPES } from '@quiz-platform/shared';
import { PracticeAuditLogService } from '../practice-audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { GradePracticeResponseDto } from './dto/grade-practice-response.dto';
import { scoreResponse } from './score-response';

type QuestionWithOptions = Prisma.PracticeQuestionGetPayload<{ include: { options: true } }>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class PracticeGradingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditLog: PracticeAuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Scores every auto-gradable question on submit; ESSAY/FILE_UPLOAD stay pending. */
  async gradeAttempt(attemptId: string): Promise<void> {
    const attempt = await this.prisma.practiceAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { quiz: { select: { mode: true } } },
    });
    if (attempt.quiz.mode === PracticeQuizMode.BANK) {
      return this.gradeBankAttempt(attemptId);
    }

    const full = await this.prisma.practiceAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: {
        quiz: { include: { questions: { include: { options: true } } } },
        responses: true,
      },
    });

    const responseByQuestion = new Map(full.responses.map((r) => [r.questionId, r]));

    for (const question of full.quiz.questions) {
      let response = responseByQuestion.get(question.id);
      if (!response) {
        // Skipped question — still needs a row so it shows up for grading
        // (or gets scored 0) rather than silently not existing anywhere.
        response = await this.prisma.practiceResponse.create({
          data: { attemptId, questionId: question.id },
        });
      }

      if (!(AUTO_GRADABLE_TYPES as string[]).includes(question.type)) {
        continue;
      }

      const awardedPoints = scoreResponse(question, response.answer);
      await this.prisma.practiceResponse.update({
        where: { id: response.id },
        data: { awardedPoints, autoGraded: true },
      });
    }

    await this.recomputeAttemptTotals(attemptId);
  }

  /** BANK-mode grading — every snapshot question is auto-gradable by
   * construction (ESSAY/FILE_UPLOAD are blocked at question-create time for
   * bank-mode quizzes), so there's no partial/pending state: the attempt
   * goes straight to GRADED, and none of it ever touches the grading queue. */
  private async gradeBankAttempt(attemptId: string): Promise<void> {
    const questions = await this.prisma.practiceAttemptQuestion.findMany({
      where: { attemptId },
      include: { options: true, response: true },
    });

    let totalAwarded = 0;
    const maxScore = questions.reduce((sum, q) => sum + Number(q.points), 0);
    for (const question of questions) {
      const existingAnswer = question.response?.answer ?? null;
      const awardedPoints = scoreResponse(question, existingAnswer);
      totalAwarded += awardedPoints;
      await this.prisma.practiceAttemptResponse.upsert({
        where: { attemptQuestionId: question.id },
        update: { answer: existingAnswer as Prisma.InputJsonValue, awardedPoints },
        create: {
          attemptId,
          attemptQuestionId: question.id,
          answer: existingAnswer as Prisma.InputJsonValue,
          awardedPoints,
        },
      });
    }

    await this.prisma.practiceAttempt.update({
      where: { id: attemptId },
      data: { maxScore, score: round2(totalAwarded), status: AttemptStatus.GRADED },
    });
  }

  private async recomputeAttemptTotals(attemptId: string) {
    const attempt = await this.prisma.practiceAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: {
        quiz: { include: { questions: true } },
        responses: true,
      },
    });

    const maxScore = attempt.quiz.questions.reduce((sum, q) => sum + Number(q.points), 0);
    const allGraded =
      attempt.responses.length === attempt.quiz.questions.length &&
      attempt.responses.every((r) => r.awardedPoints !== null);

    if (allGraded) {
      const score = attempt.responses.reduce(
        (sum, r) => sum + Number(r.awardedPoints),
        0,
      );
      await this.prisma.practiceAttempt.update({
        where: { id: attemptId },
        data: { maxScore, score: round2(score), status: AttemptStatus.GRADED },
      });
    } else {
      await this.prisma.practiceAttempt.update({
        where: { id: attemptId },
        data: { maxScore },
      });
    }
  }

  /**
   * Refreshes maxScore (and score/status if every response is graded) for
   * every non-in-progress attempt of a practice quiz — used after the
   * question set changes (add/edit/remove/reorder) so already-submitted
   * attempts stay consistent with the quiz's current definition. Does NOT
   * change awardedPoints; that only happens via an explicit regrade.
   */
  async recomputeTotalsForQuiz(quizId: string): Promise<void> {
    const attempts = await this.prisma.practiceAttempt.findMany({
      where: { quizId, status: { not: AttemptStatus.IN_PROGRESS } },
      select: { id: true },
    });
    for (const a of attempts) {
      await this.recomputeAttemptTotals(a.id);
    }
  }

  /** Re-scores every submitted response to `question` using its current
   * config/correct-answer. Returns the responses updated and the distinct
   * attempts touched, but does not recompute attempt totals itself — the
   * caller batches that across possibly-multiple questions. */
  private async regradeQuestionResponses(
    question: QuestionWithOptions,
  ): Promise<{ attemptIds: Set<string>; count: number }> {
    const responses = await this.prisma.practiceResponse.findMany({
      where: {
        questionId: question.id,
        attempt: { status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.GRADED] } },
      },
      select: { id: true, answer: true, attemptId: true },
    });

    for (const r of responses) {
      const awardedPoints = scoreResponse(question, r.answer);
      await this.prisma.practiceResponse.update({
        where: { id: r.id },
        data: { awardedPoints, autoGraded: true },
      });
    }

    return { attemptIds: new Set(responses.map((r) => r.attemptId)), count: responses.length };
  }

  private async getOwnQuestionWithOptions(
    tenantId: string,
    quizId: string,
    questionId: string,
  ): Promise<QuestionWithOptions> {
    const quiz = await this.prisma.practiceQuiz.findUnique({ where: { id: quizId } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Practice quiz not found');
    }
    if (quiz.mode === PracticeQuizMode.BANK) {
      throw new BadRequestException(
        'Regrade is not available for random question-bank quizzes',
      );
    }
    const question = await this.prisma.practiceQuestion.findUnique({
      where: { id: questionId },
      include: { options: true },
    });
    if (!question || question.quizId !== quizId) {
      throw new NotFoundException('Question not found');
    }
    if (!(AUTO_GRADABLE_TYPES as string[]).includes(question.type)) {
      throw new BadRequestException(
        `${question.type} questions are graded manually and can't be auto-regraded`,
      );
    }
    return question;
  }

  /** Recomputes awarded points for one question across every submitted
   * attempt — for when a wrong correct-answer/config gets fixed after
   * students have already answered it. */
  async regradeQuestion(
    tenantId: string,
    quizId: string,
    questionId: string,
    actorMembershipId?: string,
  ) {
    const question = await this.getOwnQuestionWithOptions(tenantId, quizId, questionId);
    const { attemptIds, count } = await this.regradeQuestionResponses(question);
    for (const attemptId of attemptIds) {
      await this.recomputeAttemptTotals(attemptId);
    }
    await this.auditLog.log(
      tenantId,
      quizId,
      actorMembershipId ?? null,
      'QUESTION_REGRADED',
      `${count} response${count === 1 ? '' : 's'} across ${attemptIds.size} attempt${attemptIds.size === 1 ? '' : 's'}`,
    );
    return { regradedResponses: count, affectedAttempts: attemptIds.size };
  }

  /** Regrades every auto-gradable question in the practice quiz in one pass. */
  async regradeQuiz(tenantId: string, quizId: string, actorMembershipId?: string) {
    const quiz = await this.prisma.practiceQuiz.findUnique({ where: { id: quizId } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Practice quiz not found');
    }
    if (quiz.mode === PracticeQuizMode.BANK) {
      throw new BadRequestException(
        'Regrade is not available for random question-bank quizzes',
      );
    }
    const questions = await this.prisma.practiceQuestion.findMany({
      where: { quizId, type: { in: AUTO_GRADABLE_TYPES as QuestionType[] } },
      include: { options: true },
    });

    const allAttemptIds = new Set<string>();
    let totalResponses = 0;
    for (const question of questions) {
      const { attemptIds, count } = await this.regradeQuestionResponses(question);
      attemptIds.forEach((id) => allAttemptIds.add(id));
      totalResponses += count;
    }
    for (const attemptId of allAttemptIds) {
      await this.recomputeAttemptTotals(attemptId);
    }
    await this.auditLog.log(
      tenantId,
      quizId,
      actorMembershipId ?? null,
      'QUIZ_REGRADED',
      `${totalResponses} response${totalResponses === 1 ? '' : 's'} across ${allAttemptIds.size} attempt${allAttemptIds.size === 1 ? '' : 's'}`,
    );
    return {
      regradedQuestions: questions.length,
      regradedResponses: totalResponses,
      affectedAttempts: allAttemptIds.size,
    };
  }

  async gradeResponse(
    tenantId: string,
    responseId: string,
    gradedByMembershipId: string,
    dto: GradePracticeResponseDto,
  ) {
    const response = await this.prisma.practiceResponse.findUnique({
      where: { id: responseId },
      include: {
        question: true,
        attempt: {
          include: { student: { include: { user: { select: { name: true } } } } },
        },
      },
    });
    if (!response) {
      throw new NotFoundException('Response not found');
    }

    const quiz = await this.prisma.practiceQuiz.findUnique({
      where: { id: response.question.quizId },
    });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Response not found');
    }
    if (response.attempt.status === AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('This attempt has not been submitted yet');
    }

    const maxPoints = Number(response.question.points);
    if (dto.awardedPoints > maxPoints) {
      throw new BadRequestException(`awardedPoints cannot exceed ${maxPoints}`);
    }

    await this.prisma.practiceResponse.update({
      where: { id: responseId },
      data: {
        awardedPoints: dto.awardedPoints,
        feedback: dto.feedback,
        gradedByMembershipId,
      },
    });

    await this.recomputeAttemptTotals(response.attemptId);

    const updatedAttempt = await this.prisma.practiceAttempt.findUniqueOrThrow({
      where: { id: response.attemptId },
    });
    if (updatedAttempt.status === AttemptStatus.GRADED) {
      await this.notifications.create(response.attempt.studentMembershipId, {
        tenantId,
        type: 'RESPONSE_GRADED',
        title: 'Practice quiz graded',
        body: `"${quiz.title}" has been fully graded.`,
        link: `/student/practice-attempts/${response.attemptId}`,
      });
    }

    await this.auditLog.log(
      tenantId,
      response.question.quizId,
      gradedByMembershipId,
      'RESPONSE_GRADED',
      response.attempt.student.user.name,
    );
    return this.prisma.practiceResponse.findUnique({ where: { id: responseId } });
  }

  async gradingQueue(tenantId: string, quizId: string) {
    const quiz = await this.prisma.practiceQuiz.findUnique({ where: { id: quizId } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Practice quiz not found');
    }
    // BANK-mode questions are all auto-gradable by construction — nothing
    // ever waits on a human, so there's never a manual grading queue.
    if (quiz.mode === PracticeQuizMode.BANK) {
      return [];
    }

    const responses = await this.prisma.practiceResponse.findMany({
      where: {
        awardedPoints: null,
        question: { quizId },
        attempt: { status: AttemptStatus.SUBMITTED },
      },
      include: {
        question: true,
        attempt: {
          include: { student: { include: { user: { select: { name: true, email: true } } } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return responses.map((r) => ({
      responseId: r.id,
      attemptId: r.attemptId,
      studentName: r.attempt.student.user.name,
      questionId: r.questionId,
      questionType: r.question.type,
      questionPrompt: r.question.prompt,
      points: r.question.points,
      answer: r.answer,
      fileKey: r.fileKey,
    }));
  }

  async getDownloadUrl(tenantId: string, responseId: string) {
    const response = await this.prisma.practiceResponse.findUnique({
      where: { id: responseId },
      include: { question: true },
    });
    if (!response) {
      throw new NotFoundException('Response not found');
    }

    const quiz = await this.prisma.practiceQuiz.findUnique({
      where: { id: response.question.quizId },
    });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Response not found');
    }
    if (!response.fileKey) {
      throw new NotFoundException('No file was uploaded for this response');
    }

    const downloadUrl = await this.storage.getDownloadUrl(response.fileKey);
    return { downloadUrl };
  }
}
