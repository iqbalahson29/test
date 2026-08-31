import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction =
  | 'QUIZ_CREATED'
  | 'STATUS_CHANGED'
  | 'SETTINGS_UPDATED'
  | 'QUESTIONS_UPDATED'
  | 'ASSIGNMENT_CREATED'
  | 'ASSIGNMENT_REMOVED'
  | 'QUESTION_REGRADED'
  | 'QUIZ_REGRADED'
  | 'RESPONSE_GRADED'
  | 'MEMBER_ADDED'
  | 'MEMBER_REMOVED'
  | 'MEMBER_ROLE_CHANGED'
  | 'MEMBER_JOINED'
  | 'JOIN_REQUEST_REJECTED'
  | 'MEMBER_INVITED'
  | 'INVITE_ACCEPTED'
  | 'INVITE_REVOKED'
  | 'WORKSPACE_PROFILE_UPDATED'
  | 'WORKSPACE_JOIN_CODE_UPDATED'
  | 'SESSION_RELEASED';

const STATUS_LABELS: Record<string, string> = {
  PUBLISHED: 'Published',
  DRAFT: 'Unpublished',
  SCHEDULED: 'Scheduled',
  ARCHIVED: 'Archived',
  RESTORED: 'Restored',
};

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  log(
    tenantId: string,
    quizId: string | null,
    actorMembershipId: string | null,
    action: AuditAction,
    detail?: string,
  ) {
    return this.prisma.auditLog.create({
      data: { tenantId, quizId, actorMembershipId, action, detail },
    });
  }

  private buildMessage(
    action: string,
    detail: string | null,
    actorName: string | null,
  ): string {
    switch (action) {
      case 'QUIZ_CREATED':
        return detail ? detail : 'Created quiz';
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
        const base = 'Regraded quiz';
        const withDetail = detail ? `${base} — ${detail}` : base;
        return actorName ? `${withDetail} (by ${actorName})` : withDetail;
      }
      case 'RESPONSE_GRADED':
        return detail ? `Graded ${detail}'s response` : 'Graded a response';
      case 'MEMBER_ADDED':
        return detail ? `${detail} added as a new member` : 'Added a new member';
      case 'MEMBER_REMOVED':
        return detail ? `Removed ${detail} from the workspace` : 'Removed a member';
      case 'MEMBER_ROLE_CHANGED':
        return detail ? `Role updated for ${detail}` : 'Updated a member role';
      case 'MEMBER_JOINED':
        return detail ? `${detail} joined the workspace` : 'A member joined the workspace';
      case 'JOIN_REQUEST_REJECTED':
        return detail ? `${detail}'s join request was rejected` : 'Rejected a join request';
      case 'MEMBER_INVITED':
        return detail ? `Invited ${detail}` : 'Invited a new member';
      case 'INVITE_ACCEPTED':
        return detail ? `${detail} accepted their invite` : 'An invite was accepted';
      case 'INVITE_REVOKED':
        return detail ? `Revoked invite for ${detail}` : 'Revoked an invite';
      case 'WORKSPACE_PROFILE_UPDATED':
        return 'Updated the workspace profile';
      case 'WORKSPACE_JOIN_CODE_UPDATED':
        return detail ? detail : 'Updated the workspace join code';
      case 'SESSION_RELEASED':
        return actorName ? `${detail} (by ${actorName})` : (detail ?? 'Released a test session');
      default:
        return action;
    }
  }

  async listForQuiz(tenantId: string, quizId: string, limit = 20) {
    const entries = await this.prisma.auditLog.findMany({
      where: { tenantId, quizId },
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
    const entries = await this.prisma.auditLog.findMany({
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
