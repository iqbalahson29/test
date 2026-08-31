import { Injectable } from '@nestjs/common';
import { AttemptStatus, QuizStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QuizzesService } from '../quizzes/quizzes.service';
import { AssignmentsService } from '../assignments/assignments.service';

const ALL_STATUSES: QuizStatus[] = [
  QuizStatus.PUBLISHED,
  QuizStatus.SCHEDULED,
  QuizStatus.DRAFT,
  QuizStatus.ARCHIVED,
];

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
const UPCOMING_LIMIT = 5;

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quizzes: QuizzesService,
    private readonly assignments: AssignmentsService,
  ) {}

  async adminOverview(tenantId: string, range: string) {
    const days = RANGE_DAYS[range] ?? 30;

    const [quizList, totalMembers, totalAttempts, gradedAttempts, allAssignments] =
      await Promise.all([
        this.quizzes.list(tenantId),
        // Excludes a super admin's membership (if they've entered this
        // workspace) — same reasoning as memberships.service.ts's list():
        // it shouldn't count as one of the workspace's own members.
        this.prisma.membership.count({
          where: { tenantId, user: { isSuperAdmin: false } },
        }),
        this.prisma.attempt.count({ where: { quiz: { tenantId } } }),
        this.prisma.attempt.findMany({
          where: { quiz: { tenantId }, status: AttemptStatus.GRADED },
          select: { score: true, maxScore: true },
        }),
        this.assignments.listAll(tenantId),
      ]);

    const percents = gradedAttempts.map(
      (a) => (Number(a.score) / Number(a.maxScore)) * 100,
    );
    const averageScorePercent =
      percents.length > 0
        ? round2(percents.reduce((sum, p) => sum + p, 0) / percents.length)
        : null;

    const statusCounts = new Map<QuizStatus, number>(ALL_STATUSES.map((s) => [s, 0]));
    for (const q of quizList) {
      statusCounts.set(q.status, (statusCounts.get(q.status) ?? 0) + 1);
    }
    const quizStatusBreakdown = ALL_STATUSES.map((status) => ({
      status,
      count: statusCounts.get(status) ?? 0,
    }));

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));
    const submitted = await this.prisma.attempt.findMany({
      where: { quiz: { tenantId }, submittedAt: { gte: since } },
      select: { submittedAt: true },
    });
    const dayCounts = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      dayCounts.set(dayKey(d), 0);
    }
    for (const a of submitted) {
      if (!a.submittedAt) continue;
      const key = dayKey(a.submittedAt);
      if (dayCounts.has(key)) {
        dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
      }
    }
    const attemptsOverTime = [...dayCounts.entries()].map(([date, count]) => ({
      date,
      count,
    }));

    const quizzes = [...quizList].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    const now = Date.now();
    const soonestByQuiz = new Map<string, (typeof allAssignments)[number]>();
    for (const a of allAssignments) {
      if (!a.dueAt || a.dueAt.getTime() < now) continue;
      const existing = soonestByQuiz.get(a.quizId);
      if (!existing || a.dueAt.getTime() < existing.dueAt!.getTime()) {
        soonestByQuiz.set(a.quizId, a);
      }
    }
    const upcomingQuizzes = [...soonestByQuiz.values()]
      .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())
      .slice(0, UPCOMING_LIMIT);

    return {
      stats: {
        totalQuizzes: quizList.length,
        totalMembers,
        totalAttempts,
        averageScorePercent,
      },
      quizStatusBreakdown,
      attemptsOverTime,
      quizzes,
      upcomingQuizzes,
    };
  }
}
