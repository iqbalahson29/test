import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, Prisma, QuestionType } from '@prisma/client';
import { AUTO_GRADABLE_TYPES, getAnswerSchema } from '@quiz-platform/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { GradeResponseDto } from './dto/grade-response.dto';

type QuestionWithOptions = Prisma.QuestionGetPayload<{ include: { options: true } }>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class GradingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Scores every auto-gradable question on submit; ESSAY/FILE_UPLOAD stay pending. */
  async gradeAttempt(attemptId: string): Promise<void> {
    const attempt = await this.prisma.attempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: {
        quiz: { include: { questions: { include: { options: true } } } },
        responses: true,
      },
    });

    const responseByQuestion = new Map(attempt.responses.map((r) => [r.questionId, r]));

    for (const question of attempt.quiz.questions) {
      let response = responseByQuestion.get(question.id);
      if (!response) {
        // Skipped question — still needs a row so it shows up for grading
        // (or gets scored 0) rather than silently not existing anywhere.
        response = await this.prisma.response.create({
          data: { attemptId, questionId: question.id },
        });
      }

      if (!(AUTO_GRADABLE_TYPES as string[]).includes(question.type)) {
        continue;
      }

      const awardedPoints = this.scoreResponse(question, response.answer);
      await this.prisma.response.update({
        where: { id: response.id },
        data: { awardedPoints, autoGraded: true },
      });
    }

    await this.recomputeAttemptTotals(attemptId);
  }

  private scoreResponse(question: QuestionWithOptions, rawAnswer: unknown): number {
    const schema = getAnswerSchema(question.type);
    const parsed = schema.safeParse(rawAnswer);
    const points = Number(question.points);
    if (!parsed.success) return 0;
    // Each branch below accesses only the fields its own schema guarantees;
    // a single loose cast here keeps the per-type branching readable
    // (same convention as question-sanitizer.ts's per-type config casts).
    const answer = parsed.data as unknown as Record<string, unknown>;

    switch (question.type) {
      case QuestionType.MCQ_SINGLE:
      case QuestionType.TRUE_FALSE: {
        const correctOption = question.options.find((o) => o.isCorrect);
        return answer.optionId === correctOption?.id ? points : 0;
      }
      case QuestionType.MCQ_MULTI: {
        const correctIds = new Set(
          question.options.filter((o) => o.isCorrect).map((o) => o.id),
        );
        const selectedIds = (answer.optionIds as string[]) ?? [];
        const correctSelected = selectedIds.filter((id) => correctIds.has(id)).length;
        const incorrectSelected = selectedIds.length - correctSelected;
        if (correctIds.size === 0) return 0;
        const fraction = Math.max(0, correctSelected - incorrectSelected) / correctIds.size;
        return round2(points * fraction);
      }
      case QuestionType.NUMERIC: {
        const config = question.config as { correctAnswer: number; tolerance: number };
        const value = answer.value as number;
        return Math.abs(value - config.correctAnswer) <= config.tolerance ? points : 0;
      }
      case QuestionType.SHORT_TEXT: {
        const config = question.config as {
          acceptedAnswers: string[];
          caseSensitive: boolean;
        };
        const normalize = (s: string) =>
          config.caseSensitive ? s.trim() : s.trim().toLowerCase();
        const target = normalize((answer.text as string) ?? '');
        const matches = config.acceptedAnswers.some((a) => normalize(a) === target);
        return matches ? points : 0;
      }
      case QuestionType.MATCHING: {
        const config = question.config as { pairs: { left: string; right: string }[] };
        const selections = (answer.selections as { left: string; right: string }[]) ?? [];
        let correct = 0;
        for (const pair of config.pairs) {
          if (
            selections.some((s) => s.left === pair.left && s.right === pair.right)
          ) {
            correct++;
          }
        }
        if (config.pairs.length === 0) return 0;
        return round2(points * (correct / config.pairs.length));
      }
      case QuestionType.FILL_BLANK: {
        const config = question.config as {
          blanks: { acceptedAnswers: string[]; caseSensitive: boolean }[];
        };
        const givenAnswers = (answer.answers as string[]) ?? [];
        let correct = 0;
        config.blanks.forEach((blank, i) => {
          const given = givenAnswers[i];
          if (given == null) return;
          const normalize = (s: string) =>
            blank.caseSensitive ? s.trim() : s.trim().toLowerCase();
          const target = normalize(given);
          if (blank.acceptedAnswers.some((a) => normalize(a) === target)) correct++;
        });
        if (config.blanks.length === 0) return 0;
        return round2(points * (correct / config.blanks.length));
      }
      default:
        return 0;
    }
  }

  private async recomputeAttemptTotals(attemptId: string) {
    const attempt = await this.prisma.attempt.findUniqueOrThrow({
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
      await this.prisma.attempt.update({
        where: { id: attemptId },
        data: { maxScore, score: round2(score), status: AttemptStatus.GRADED },
      });
    } else {
      await this.prisma.attempt.update({
        where: { id: attemptId },
        data: { maxScore },
      });
    }
  }

  async gradeResponse(
    tenantId: string,
    responseId: string,
    gradedByMembershipId: string,
    dto: GradeResponseDto,
  ) {
    const response = await this.prisma.response.findUnique({
      where: { id: responseId },
      include: { question: true, attempt: true },
    });
    if (!response) {
      throw new NotFoundException('Response not found');
    }

    const quiz = await this.prisma.quiz.findUnique({
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

    await this.prisma.response.update({
      where: { id: responseId },
      data: {
        awardedPoints: dto.awardedPoints,
        feedback: dto.feedback,
        gradedByMembershipId,
      },
    });

    await this.recomputeAttemptTotals(response.attemptId);
    return this.prisma.response.findUnique({ where: { id: responseId } });
  }

  async gradingQueue(tenantId: string, quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Quiz not found');
    }

    const responses = await this.prisma.response.findMany({
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
    const response = await this.prisma.response.findUnique({
      where: { id: responseId },
      include: { question: true },
    });
    if (!response) {
      throw new NotFoundException('Response not found');
    }

    const quiz = await this.prisma.quiz.findUnique({
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
