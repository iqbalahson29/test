import { Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, PracticeQuizMode } from '@prisma/client';
import { QUIZ_MODULE_SEQUENCE } from '@quiz-platform/shared';
import { PrismaService } from '../prisma/prisma.service';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function average(arr: number[]): number | null {
  return arr.length ? arr.reduce((sum, x) => sum + x, 0) / arr.length : null;
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

@Injectable()
export class PracticeAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async quizAnalytics(tenantId: string, quizId: string) {
    const quiz = await this.prisma.practiceQuiz.findUnique({
      where: { id: quizId },
      include: { questions: { orderBy: [{ module: 'asc' }, { order: 'asc' }] } },
    });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Practice quiz not found');
    }

    const totalAttempts = await this.prisma.practiceAttempt.count({ where: { quizId } });
    const gradedAttempts = await this.prisma.practiceAttempt.findMany({
      where: { quizId, status: AttemptStatus.GRADED },
    });

    const scores = gradedAttempts.map((a) => Number(a.score));
    const percents = gradedAttempts.map(
      (a) => (Number(a.score) / Number(a.maxScore)) * 100,
    );

    const scoreDistribution = Array.from({ length: 10 }, (_, i) => ({
      bucket: `${i * 10}-${i * 10 + 10}%`,
      count: 0,
    }));
    for (const p of percents) {
      const idx = Math.min(9, Math.floor(p / 10));
      scoreDistribution[idx].count++;
    }

    const passMarkPercent = quiz.passMarkPercent;
    const passRate =
      passMarkPercent != null && percents.length > 0
        ? round2(
            (percents.filter((p) => p >= Number(passMarkPercent)).length /
              percents.length) *
              100,
          )
        : null;

    const avgScore = average(scores);
    const medScore = median(scores);
    const avgPercent = average(percents);
    const medPercent = median(percents);

    // BANK mode: each attempt drew a different random question set (and can
    // even have a different maxScore, since points-per-question vary), so
    // "per question" / "per difficulty" / "per module" breakdowns and a
    // single quiz-wide maxScore are all meaningless here — aggregate stats
    // only. Per-attempt detail (the admin's override view, and the
    // student's own review) still shows full detail via attemptDetail().
    if (quiz.mode === PracticeQuizMode.BANK) {
      return {
        quizTitle: quiz.title,
        totalAttempts,
        gradedAttempts: gradedAttempts.length,
        averageScore: avgScore !== null ? round2(avgScore) : null,
        medianScore: medScore !== null ? round2(medScore) : null,
        averagePercent: avgPercent !== null ? round2(avgPercent) : null,
        medianPercent: medPercent !== null ? round2(medPercent) : null,
        passMarkPercent,
        passRate,
        scoreDistribution,
      };
    }

    const responses = await this.prisma.practiceResponse.findMany({
      where: { question: { quizId }, attempt: { status: AttemptStatus.GRADED } },
    });
    const byQuestion = new Map(
      quiz.questions.map((q) => [
        q.id,
        { points: Number(q.points), totalAwarded: 0, fullCredit: 0, count: 0 },
      ]),
    );
    for (const r of responses) {
      const entry = byQuestion.get(r.questionId);
      if (!entry) continue;
      const awarded = Number(r.awardedPoints ?? 0);
      entry.totalAwarded += awarded;
      entry.count++;
      if (entry.points > 0 && awarded >= entry.points) entry.fullCredit++;
    }

    const perQuestion = quiz.questions.map((q) => {
      const entry = byQuestion.get(q.id)!;
      return {
        questionId: q.id,
        prompt: q.prompt,
        type: q.type,
        points: q.points,
        difficulty: q.difficulty,
        module: q.module,
        percentCorrect:
          entry.count > 0 ? round2((entry.fullCredit / entry.count) * 100) : null,
        averagePercent:
          entry.count > 0 && entry.points > 0
            ? round2((entry.totalAwarded / entry.count / entry.points) * 100)
            : null,
      };
    });

    const byDifficulty = (['EASY', 'MEDIUM', 'HARD'] as const).map((difficulty) => {
      const inLevel = perQuestion.filter((q) => q.difficulty === difficulty);
      const withAverage = inLevel.filter((q) => q.averagePercent !== null);
      return {
        difficulty,
        questionCount: inLevel.length,
        averagePercent:
          withAverage.length > 0
            ? round2(
                withAverage.reduce((sum, q) => sum + q.averagePercent!, 0) /
                  withAverage.length,
              )
            : null,
      };
    });

    const byModule = QUIZ_MODULE_SEQUENCE.map((module) => {
      const inModule = perQuestion.filter((q) => q.module === module);
      const withAverage = inModule.filter((q) => q.averagePercent !== null);
      return {
        module,
        questionCount: inModule.length,
        averagePercent:
          withAverage.length > 0
            ? round2(
                withAverage.reduce((sum, q) => sum + q.averagePercent!, 0) /
                  withAverage.length,
              )
            : null,
      };
    });

    return {
      quizTitle: quiz.title,
      totalAttempts,
      gradedAttempts: gradedAttempts.length,
      averageScore: avgScore !== null ? round2(avgScore) : null,
      medianScore: medScore !== null ? round2(medScore) : null,
      averagePercent: avgPercent !== null ? round2(avgPercent) : null,
      medianPercent: medPercent !== null ? round2(medPercent) : null,
      maxScore: quiz.questions.reduce((sum, q) => sum + Number(q.points), 0),
      passMarkPercent,
      passRate,
      scoreDistribution,
      perQuestion,
      byDifficulty,
      byModule,
    };
  }

  async myAnalytics(tenantId: string, studentMembershipId: string) {
    const attempts = await this.prisma.practiceAttempt.findMany({
      where: { studentMembershipId, quiz: { tenantId } },
      include: { quiz: { select: { title: true } } },
      orderBy: { submittedAt: 'asc' },
    });

    const gradedAttempts = attempts.filter((a) => a.status === AttemptStatus.GRADED);
    const percents = gradedAttempts.map(
      (a) => (Number(a.score) / Number(a.maxScore)) * 100,
    );
    const avgPercent = average(percents);

    return {
      averagePercent: avgPercent !== null ? round2(avgPercent) : null,
      attempts: attempts.map((a) => ({
        attemptId: a.id,
        quizTitle: a.quiz.title,
        attemptNumber: a.attemptNumber,
        status: a.status,
        score: a.score,
        maxScore: a.maxScore,
        percent:
          a.status === AttemptStatus.GRADED
            ? round2((Number(a.score) / Number(a.maxScore)) * 100)
            : null,
        submittedAt: a.submittedAt,
      })),
      trend: gradedAttempts.map((a) => ({
        submittedAt: a.submittedAt,
        quizTitle: a.quiz.title,
        percent: round2((Number(a.score) / Number(a.maxScore)) * 100),
      })),
    };
  }
}
