import { Injectable } from '@nestjs/common';
import { AttemptStatus, QuizStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const RESULT_LIMIT = 5;
const MIN_QUERY_LENGTH = 2;

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  path: string;
  /** Set when reaching this result requires switching into a workspace
   * other than the one currently active — the frontend switches first. */
  membershipId?: string;
}

export interface SearchResponse {
  workspaces: SearchResultItem[];
  quizzes: SearchResultItem[];
  members: SearchResultItem[];
  attempts: SearchResultItem[];
}

const EMPTY_RESPONSE: SearchResponse = {
  workspaces: [],
  quizzes: [],
  members: [],
  attempts: [],
};

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(userId: string, rawQuery: string): Promise<SearchResponse> {
    const query = rawQuery.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      return EMPTY_RESPONSE;
    }

    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      select: {
        id: true,
        tenantId: true,
        role: true,
        tenant: { select: { name: true } },
      },
    });

    const tenantNameById = new Map(memberships.map((m) => [m.tenantId, m.tenant.name]));
    const studentMemberships = memberships.filter((m) => m.role === Role.STUDENT);
    const adminMemberships = memberships.filter((m) => m.role === Role.ADMIN);
    const studentMembershipIds = studentMemberships.map((m) => m.id);
    const adminTenantIds = adminMemberships.map((m) => m.tenantId);
    const membershipIdByTenantId = new Map(memberships.map((m) => [m.tenantId, m.id]));
    const memberTenantIds = new Set(memberships.map((m) => m.tenantId));

    const [workspaces, quizzes, members, attempts] = await Promise.all([
      this.searchWorkspaces(query, memberTenantIds),
      this.searchQuizzes(query, adminTenantIds, studentMembershipIds, membershipIdByTenantId, tenantNameById),
      this.searchMembers(query, adminTenantIds, membershipIdByTenantId, tenantNameById),
      this.searchAttempts(query, adminTenantIds, studentMembershipIds, membershipIdByTenantId, tenantNameById),
    ]);

    return { workspaces, quizzes, members, attempts };
  }

  private async searchWorkspaces(
    query: string,
    memberTenantIds: Set<string>,
  ): Promise<SearchResultItem[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: { name: { contains: query, mode: 'insensitive' } },
      select: { id: true, name: true, slug: true, _count: { select: { memberships: true } } },
      orderBy: { name: 'asc' },
      take: RESULT_LIMIT,
    });
    return tenants.map((t) => ({
      id: t.id,
      title: t.name,
      subtitle: memberTenantIds.has(t.id)
        ? `${t._count.memberships} members · You're a member`
        : `${t._count.memberships} members`,
      path: `/join/${t.slug}`,
    }));
  }

  private async searchQuizzes(
    query: string,
    adminTenantIds: string[],
    studentMembershipIds: string[],
    membershipIdByTenantId: Map<string, string>,
    tenantNameById: Map<string, string>,
  ): Promise<SearchResultItem[]> {
    const results: SearchResultItem[] = [];

    if (adminTenantIds.length > 0) {
      const ownQuizzes = await this.prisma.quiz.findMany({
        where: { tenantId: { in: adminTenantIds }, title: { contains: query, mode: 'insensitive' } },
        select: { id: true, title: true, status: true, tenantId: true },
        orderBy: { updatedAt: 'desc' },
        take: RESULT_LIMIT,
      });
      for (const quiz of ownQuizzes) {
        results.push({
          id: `admin-quiz-${quiz.id}`,
          title: quiz.title,
          subtitle: `${tenantNameById.get(quiz.tenantId)} · ${quiz.status}`,
          path: `/teacher/quizzes/${quiz.id}`,
          membershipId: membershipIdByTenantId.get(quiz.tenantId),
        });
      }
    }

    if (studentMembershipIds.length > 0) {
      const groupIds = (
        await this.prisma.groupMember.findMany({
          where: { membershipId: { in: studentMembershipIds } },
          select: { groupId: true },
        })
      ).map((g) => g.groupId);

      const assignments = await this.prisma.quizAssignment.findMany({
        where: {
          quiz: { status: QuizStatus.PUBLISHED, title: { contains: query, mode: 'insensitive' } },
          OR: [
            { studentMembershipId: { in: studentMembershipIds } },
            ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : []),
          ],
        },
        select: { quiz: { select: { id: true, title: true, tenantId: true } } },
        take: RESULT_LIMIT * 2,
      });
      const seen = new Set<string>();
      for (const a of assignments) {
        if (seen.has(a.quiz.id) || results.length >= RESULT_LIMIT * 2) continue;
        seen.add(a.quiz.id);
        results.push({
          id: `student-quiz-${a.quiz.id}`,
          title: a.quiz.title,
          subtitle: `${tenantNameById.get(a.quiz.tenantId)} · Assigned to you`,
          path: '/student',
          membershipId: membershipIdByTenantId.get(a.quiz.tenantId),
        });
        if (seen.size >= RESULT_LIMIT) break;
      }
    }

    return results.slice(0, RESULT_LIMIT);
  }

  private async searchMembers(
    query: string,
    adminTenantIds: string[],
    membershipIdByTenantId: Map<string, string>,
    tenantNameById: Map<string, string>,
  ): Promise<SearchResultItem[]> {
    if (adminTenantIds.length === 0) return [];

    const members = await this.prisma.membership.findMany({
      where: {
        tenantId: { in: adminTenantIds },
        user: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        },
      },
      select: {
        id: true,
        tenantId: true,
        role: true,
        user: { select: { name: true, email: true } },
      },
      take: RESULT_LIMIT,
    });

    return members.map((m) => ({
      id: `member-${m.id}`,
      title: m.user.name,
      subtitle: `${m.user.email} · ${tenantNameById.get(m.tenantId)}`,
      path: '/admin/members',
      membershipId: membershipIdByTenantId.get(m.tenantId),
    }));
  }

  private async searchAttempts(
    query: string,
    adminTenantIds: string[],
    studentMembershipIds: string[],
    membershipIdByTenantId: Map<string, string>,
    tenantNameById: Map<string, string>,
  ): Promise<SearchResultItem[]> {
    const results: SearchResultItem[] = [];

    if (studentMembershipIds.length > 0) {
      const ownAttempts = await this.prisma.attempt.findMany({
        where: {
          studentMembershipId: { in: studentMembershipIds },
          status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.GRADED] },
          quiz: { title: { contains: query, mode: 'insensitive' } },
        },
        select: {
          id: true,
          status: true,
          score: true,
          maxScore: true,
          quiz: { select: { title: true, tenantId: true } },
        },
        orderBy: { submittedAt: 'desc' },
        take: RESULT_LIMIT,
      });
      for (const a of ownAttempts) {
        const scoreLabel =
          a.status === AttemptStatus.GRADED && a.score !== null && a.maxScore !== null
            ? `${a.score}/${a.maxScore}`
            : 'Awaiting grading';
        results.push({
          id: `student-attempt-${a.id}`,
          title: a.quiz.title,
          subtitle: `${tenantNameById.get(a.quiz.tenantId)} · ${scoreLabel}`,
          path: `/student/attempts/${a.id}`,
          membershipId: membershipIdByTenantId.get(a.quiz.tenantId),
        });
      }
    }

    if (adminTenantIds.length > 0) {
      const pending = await this.prisma.attempt.findMany({
        where: {
          status: AttemptStatus.SUBMITTED,
          quiz: { tenantId: { in: adminTenantIds }, title: { contains: query, mode: 'insensitive' } },
        },
        select: {
          id: true,
          quiz: { select: { id: true, title: true, tenantId: true } },
          student: { select: { user: { select: { name: true } } } },
        },
        take: RESULT_LIMIT,
      });
      for (const a of pending) {
        results.push({
          id: `grading-${a.id}`,
          title: a.quiz.title,
          subtitle: `${a.student.user.name} · Needs grading`,
          path: `/teacher/quizzes/${a.quiz.id}/grading`,
          membershipId: membershipIdByTenantId.get(a.quiz.tenantId),
        });
      }
    }

    return results.slice(0, RESULT_LIMIT);
  }
}
