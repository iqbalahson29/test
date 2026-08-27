import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuizStatus, Role } from '@prisma/client';
import { MembershipsService } from '../memberships/memberships.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
  ) {}

  async create(
    tenantId: string,
    assignedByMembershipId: string,
    dto: CreateAssignmentDto,
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

    const quiz = await this.prisma.quiz.findUnique({ where: { id: dto.quizId } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Quiz not found');
    }
    if (quiz.status !== QuizStatus.PUBLISHED) {
      throw new BadRequestException('Only published quizzes can be assigned');
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

    const existing = await this.prisma.quizAssignment.findFirst({
      where: {
        quizId: dto.quizId,
        studentMembershipId: hasGroup ? null : studentMembershipId,
        groupId: hasGroup ? dto.groupId : null,
      },
    });
    if (existing) {
      throw new ConflictException('This quiz is already assigned to that target');
    }

    return this.prisma.quizAssignment.create({
      data: {
        tenantId,
        quizId: dto.quizId,
        studentMembershipId: hasGroup ? undefined : studentMembershipId,
        groupId: dto.groupId,
        assignedByMembershipId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
    });
  }

  async listForQuiz(tenantId: string, quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz || quiz.tenantId !== tenantId) {
      throw new NotFoundException('Quiz not found');
    }

    const assignments = await this.prisma.quizAssignment.findMany({
      where: { quizId },
      include: {
        student: {
          include: { user: { select: { id: true, email: true, name: true } } },
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
          }
        : { type: 'GROUP' as const, name: a.group!.name },
    }));
  }

  async remove(tenantId: string, id: string) {
    const assignment = await this.prisma.quizAssignment.findUnique({ where: { id } });
    if (!assignment || assignment.tenantId !== tenantId) {
      throw new NotFoundException('Assignment not found');
    }
    await this.prisma.quizAssignment.delete({ where: { id } });
    return { id };
  }

  async mine(tenantId: string, studentMembershipId: string) {
    const groupMemberships = await this.prisma.groupMember.findMany({
      where: { membershipId: studentMembershipId },
      select: { groupId: true },
    });
    const groupIds = groupMemberships.map((g) => g.groupId);

    const assignments = await this.prisma.quizAssignment.findMany({
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
      const attempts = await this.prisma.attempt.findMany({
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
        timeLimitSec: a.quiz.timeLimitSec,
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
