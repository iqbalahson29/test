import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Kept as a fully separate type/table from AuditAction/AuditLog (see
// audit-log/audit-log.service.ts) so practice-quiz activity never mixes with
// regular-quiz or membership/workspace activity.
export type PracticeAuditAction =
  | 'PRACTICE_QUIZ_CREATED'
  | 'STATUS_CHANGED'
  | 'SETTINGS_UPDATED'
  | 'QUESTIONS_UPDATED'
  | 'ASSIGNMENT_CREATED'
  | 'ASSIGNMENT_REMOVED'
  | 'QUESTION_REGRADED'
  | 'QUIZ_REGRADED'
  | 'RESPONSE_GRADED'
  | 'SESSION_RELEASED';

const STATUS_LABELS: Record<string, string> = {
  PUBLISHED: 'Published',
  DRAFT: 'Unpublished',
  SCHEDULED: 'Scheduled',
  ARCHIVED: 'Archived',
  RESTORED: 'Restored',
};

@Injectable()
export class PracticeAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  log(
    tenantId: string,
    practiceQuizId: string | null,
    actorMembershipId: string | null,
    action: PracticeAuditAction,
    detail?: string,
  ) {
    return this.prisma.practiceAuditLog.create({
      data: { tenantId, practiceQuizId, actorMembershipId, action, detail },
    });
  }

  private buildMessage(
    action: string,
    detail: string | null,
    actorName: string | null,
  ): string {
    switch (action) {
      case 'PRACTICE_QUIZ_CREATED':
        return detail ? detail : 'Created practice quiz';
      case 'STATUS_CHANGED': {
        const label = (detail && STATUS_LABELS[detail]) || 'Status updated';
        return actorName ? `${label} by ${actorName}` : label;
      }
      case 'SETTINGS_UPDATED':
        return 'Updated settings';
      case 'QUESTIONS_UPDATED':
        return 'Updated questions';
      case 'ASSIGNMENT_CREATED':
        return detail ? `Assigned to ${detail}` : 'Assigned to a student';
      case 'ASSIGNMENT_REMOVED':
        return detail ? `Removed assignment for ${detail}` : 'Removed an assignment';
      case 'QUESTION_REGRADED': {
        const base = 'Regraded a question';
        const withDetail = detail ? `${base} — ${detail}` : base;
        return actorName ? `${withDetail} (by ${actorName})` : withDetail;
      }
      case 'QUIZ_REGRADED': {
        const base = 'Regraded practice quiz';
        const withDetail = detail ? `${base} — ${detail}` : base;
        return actorName ? `${withDetail} (by ${actorName})` : withDetail;
      }
      case 'RESPONSE_GRADED':
        return detail ? `Graded ${detail}'s response` : 'Graded a response';
      case 'SESSION_RELEASED':
        return actorName ? `${detail} (by ${actorName})` : (detail ?? 'Released a test session');
      default:
        return action;
    }
  }

  async listForQuiz(tenantId: string, practiceQuizId: string, limit = 20) {
    const entries = await this.prisma.practiceAuditLog.findMany({
      where: { tenantId, practiceQuizId },
      include: { actor: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return entries.map((e) => ({
      id: e.id,
      action: e.action,
      message: this.buildMessage(e.action, e.detail, e.actor?.user.name ?? null),
      createdAt: e.createdAt,
    }));
  }

  async listForTenant(tenantId: string, limit = 8) {
    const entries = await this.prisma.practiceAuditLog.findMany({
      where: { tenantId },
      include: { actor: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return entries.map((e) => ({
      id: e.id,
      action: e.action,
      message: this.buildMessage(e.action, e.detail, e.actor?.user.name ?? null),
      createdAt: e.createdAt,
    }));
  }
}
