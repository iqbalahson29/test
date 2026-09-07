import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuizStatus, Role } from '@prisma/client';
import { TOTAL_QUIZ_TIME_LIMIT_SEC } from '@quiz-platform/shared';
import { PracticeAuditLogService } from '../practice-audit-log/audit-log.service';
import { MembershipsService } from '../memberships/memberships.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePracticeAssignmentDto } from './dto/create-practice-assignment.dto';

@Injectable()
export class PracticeAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly auditLog: PracticeAuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    tenantId: string,
    assignedByMembershipId: string,
    dto: CreatePracticeAssignmentDto,
  ) {
    const hasEmail = !!dto.studentEmail;
    const hasStudent = !!dto.studentMembershipId;
    const hasGroup = !!dto.groupId;
    const targetCount = [hasEmail, hasStudent, hasGroup].filter(Boolean).length;
    if (targetCount !== 1) {
      throw new BadRequestException(
        'Exactly one of studentEmail, studentMembershipId, or groupId must be provided',
      );
    }

    const quiz = await this.prisma.practiceQuiz.findUnique({ where: { id: dto.quizId } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Practice quiz not found');
    }
    if (quiz.status !== QuizStatus.PUBLISHED) {
      throw new BadRequestException('Only published practice quizzes can be assigned');
    }

    let studentMembershipId: string | undefined = dto.studentMembershipId;

    if (hasEmail) {
      const membership = await this.memberships.findOrCreateStudentMembershipByEmail(
        tenantId,
        dto.studentEmail!,
      );
      studentMembershipId = membership.id;
    } else if (hasStudent) {
      const membership = await this.prisma.membership.findUnique({
        where: { id: dto.studentMembershipId },
      });
      if (!membership || membership.tenantId !== tenantId) {
        throw new BadRequestException('Student not found in this tenant');
      }
      if (membership.role !== Role.STUDENT) {
        throw new BadRequestException('Target membership is not a student');
      }
    } else {
      const group = await this.prisma.group.findUnique({ where: { id: dto.groupId } });
      if (!group || group.tenantId !== tenantId) {
        throw new BadRequestException('Group not found in this tenant');
      }
    }

    const existing = await this.prisma.practiceQuizAssignment.findFirst({
      where: {
        quizId: dto.quizId,
        studentMembershipId: hasGroup ? null : studentMembershipId,
        groupId: hasGroup ? dto.groupId : null,
      },
    });
    if (existing) {
      throw new ConflictException('This practice quiz is already assigned to that target');
    }

    const created = await this.prisma.practiceQuizAssignment.create({
      data: {
        tenantId,
        quizId: dto.quizId,
        studentMembershipId: hasGroup ? undefined : studentMembershipId,
        groupId: dto.groupId,
        assignedByMembershipId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
    });

    const targetName = hasGroup
      ? (await this.prisma.group.findUnique({ where: { id: dto.groupId } }))?.name
      : (
          await this.prisma.membership.findUnique({
            where: { id: studentMembershipId },
            include: { user: { select: { name: true } } },
          })
        )?.user.name;
    await this.auditLog.log(
      tenantId,
      dto.quizId,
      assignedByMembershipId,
      'ASSIGNMENT_CREATED',
      targetName,
    );

    const targetMembershipIds = hasGroup
      ? (
          await this.prisma.groupMember.findMany({
            where: { groupId: dto.groupId },
            select: { membershipId: true },
          })
        ).map((m) => m.membershipId)
      : [studentMembershipId!];
    await this.notifications.createMany(targetMembershipIds, {
      tenantId,
      type: 'QUIZ_ASSIGNED',
      title: 'New practice quiz assigned',
      body: `"${quiz.title}" was assigned to you.`,
      link: '/student/practice-quizzes',
    });

    return created;
  }

  /** Assigns a practice quiz to every current STUDENT in the tenant in one
   * go, skipping anyone already individually assigned (a group assignment
   * that happens to cover them isn't treated as a duplicate — this only
   * dedupes against existing direct student assignments). */
  async assignToAll(
    tenantId: string,
    assignedByMembershipId: string,
    quizId: string,
    dueAt?: string,
  ) {
    const quiz = await this.prisma.practiceQuiz.findUnique({ where: { id: quizId } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Practice quiz not found');
    }
    if (quiz.status !== QuizStatus.PUBLISHED) {
      throw new BadRequestException('Only published practice quizzes can be assigned');
    }

    const [students, existing] = await Promise.all([
      this.prisma.membership.findMany({
        where: { tenantId, role: Role.STUDENT },
        select: { id: true },
      }),
      this.prisma.practiceQuizAssignment.findMany({
        where: { quizId, studentMembershipId: { not: null } },
        select: { studentMembershipId: true },
      }),
    ]);
    const alreadyAssigned = new Set(existing.map((e) => e.studentMembershipId));
    const toAssign = students.filter((s) => !alreadyAssigned.has(s.id));

    if (toAssign.length > 0) {
      await this.prisma.practiceQuizAssignment.createMany({
        data: toAssign.map((s) => ({
          tenantId,
          quizId,
          studentMembershipId: s.id,
          assignedByMembershipId,
          dueAt: dueAt ? new Date(dueAt) : undefined,
        })),
      });
      await this.notifications.createMany(
        toAssign.map((s) => s.id),
        {
          tenantId,
          type: 'QUIZ_ASSIGNED',
          title: 'New practice quiz assigned',
          body: `"${quiz.title}" was assigned to you.`,
          link: '/student/practice-quizzes',
        },
      );
    }

    await this.auditLog.log(
      tenantId,
      quizId,
      assignedByMembershipId,
      'ASSIGNMENT_CREATED',
      `all students (${toAssign.length} newly assigned)`,
    );

    return {
      assigned: toAssign.length,
      alreadyAssigned: students.length - toAssign.length,
      totalStudents: students.length,
    };
  }

  async listForQuiz(tenantId: string, quizId: string) {
    const quiz = await this.prisma.practiceQuiz.findUnique({ where: { id: quizId } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Practice quiz not found');
    }

    const assignments = await this.prisma.practiceQuizAssignment.findMany({
      where: { quizId },
      include: {
        student: {
          include: {
            user: { select: { id: true, email: true, name: true, avatarUrl: true } },
          },
        },
        group: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return assignments.map((a) => ({
      id: a.id,
      dueAt: a.dueAt,
      target: a.student
        ? {
            type: 'STUDENT' as const,
            name: a.student.user.name,
            email: a.student.user.email,
            avatarUrl: a.student.user.avatarUrl,
          }
        : { type: 'GROUP' as const, name: a.group!.name },
    }));
  }

  /**
   * Tenant-wide, all-practice-quizzes assignment listing — the calendar
   * backbone shared by the admin dashboard's calendar and the student's
   * "My practice quizzes" calendar reads the same PracticeQuizAssignment
   * rows via mine().
   */
  async listAll(tenantId: string) {
    const assignments = await this.prisma.practiceQuizAssignment.findMany({
      where: { tenantId, dueAt: { not: null } },
      include: {
        quiz: { select: { id: true, title: true, status: true } },
        student: {
          include: { user: { select: { name: true, email: true } } },
        },
        group: { select: { name: true } },
      },
      orderBy: { dueAt: 'asc' },
    });
    return assignments.map((a) => ({
      id: a.id,
      quizId: a.quizId,
      quizTitle: a.quiz.title,
      dueAt: a.dueAt,
      target: a.student
        ? { type: 'STUDENT' as const, name: a.student.user.name }
        : { type: 'GROUP' as const, name: a.group!.name },
    }));
  }

  async remove(tenantId: string, id: string, actorMembershipId?: string) {
    const assignment = await this.prisma.practiceQuizAssignment.findUnique({
      where: { id },
      include: {
        student: { include: { user: { select: { name: true } } } },
        group: true,
      },
    });
    if (!assignment || assignment.tenantId !== tenantId) {
      throw new NotFoundException('Assignment not found');
    }
    await this.prisma.practiceQuizAssignment.delete({ where: { id } });
    await this.auditLog.log(
      tenantId,
      assignment.quizId,
      actorMembershipId ?? null,
      'ASSIGNMENT_REMOVED',
      assignment.student?.user.name ?? assignment.group?.name,
    );
    return { id };
  }

  /**
   * Expands a practice quiz's assignments (direct students + whole groups)
   * into a deduped list of individual assigned students, for the quiz
   * detail page's "Assigned to" stat tile and assignment summary card.
   */
  async summaryForQuiz(tenantId: string, quizId: string) {
    const quiz = await this.prisma.practiceQuiz.findUnique({ where: { id: quizId } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Practice quiz not found');
    }

    const assignments = await this.prisma.practiceQuizAssignment.findMany({
      where: { quizId },
      include: {
        student: {
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
        group: {
          include: {
            members: {
              include: {
                membership: {
                  include: { user: { select: { id: true, name: true, avatarUrl: true } } },
                },
              },
            },
          },
        },
      },
    });

    const students = new Map<
      string,
      { id: string; name: string; avatarUrl: string | null }
    >();
    let nearestDueAt: Date | null = null;
    for (const a of assignments) {
      if (a.dueAt && (!nearestDueAt || a.dueAt.getTime() < nearestDueAt.getTime())) {
        nearestDueAt = a.dueAt;
      }
      if (a.student) {
        students.set(a.student.id, {
          id: a.student.id,
          name: a.student.user.name,
          avatarUrl: a.student.user.avatarUrl,
        });
      } else if (a.group) {
        for (const m of a.group.members) {
          students.set(m.membership.id, {
            id: m.membership.id,
            name: m.membership.user.name,
            avatarUrl: m.membership.user.avatarUrl,
          });
        }
      }
    }

    return { assignedStudents: [...students.values()], nearestDueAt };
  }

  async mine(tenantId: string, studentMembershipId: string) {
    const groupMemberships = await this.prisma.groupMember.findMany({
      where: { membershipId: studentMembershipId },
      select: { groupId: true },
    });
    const groupIds = groupMemberships.map((g) => g.groupId);

    const assignments = await this.prisma.practiceQuizAssignment.findMany({
      where: {
        tenantId,
        quiz: { status: QuizStatus.PUBLISHED },
        OR: [
          { studentMembershipId },
          ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : []),
        ],
      },
      include: { quiz: true },
    });

    const byQuiz = new Map<string, (typeof assignments)[number]>();
    for (const a of assignments) {
      const existing = byQuiz.get(a.quizId);
      if (!existing) {
        byQuiz.set(a.quizId, a);
        continue;
      }
      const existingDue = existing.dueAt?.getTime();
      const candidateDue = a.dueAt?.getTime();
      if (
        candidateDue !== undefined &&
        (existingDue === undefined || candidateDue < existingDue)
      ) {
        byQuiz.set(a.quizId, a);
      }
    }

    const results: {
      assignmentId: string;
      quizId: string;
      quizTitle: string;
      dueAt: Date | null;
      timeLimitSec: number | null;
      maxAttempts: number | null;
      attemptsUsed: number;
      status: 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED' | 'NOT_STARTED';
      latestAttemptId: string | null;
      score: Prisma.Decimal | null;
      maxScore: Prisma.Decimal | null;
    }[] = [];
    for (const a of byQuiz.values()) {
      const attempts = await this.prisma.practiceAttempt.findMany({
        where: { quizId: a.quizId, studentMembershipId },
        orderBy: { attemptNumber: 'desc' },
      });
      // attempts[0] is the most recent by attemptNumber, and since a new
      // attempt can't start while one is IN_PROGRESS, it's necessarily
      // that in-progress attempt whenever one exists.
      const current = attempts[0];
      const attemptsUsed = attempts.filter((x) => x.status !== 'IN_PROGRESS').length;
      results.push({
        assignmentId: a.id,
        quizId: a.quizId,
        quizTitle: a.quiz.title,
        dueAt: a.dueAt,
        timeLimitSec: TOTAL_QUIZ_TIME_LIMIT_SEC,
        maxAttempts: a.quiz.maxAttempts,
        attemptsUsed,
        status: current?.status ?? 'NOT_STARTED',
        latestAttemptId: current?.id ?? null,
        score: current?.status === 'GRADED' ? current.score : null,
        maxScore: current?.status === 'GRADED' ? current.maxScore : null,
      });
    }
    return results;
  }
}
