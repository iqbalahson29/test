import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { SessionService } from '../auth/session.service';
import { serial, authError, Tx } from '../auth/security/primitives';
import { SecurityEventsService } from '../auth/security/security-events.service';
import type { AnyAccessTokenPayload } from '../auth/token.types';
import { normalizeIdentifier } from '@quiz-platform/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly events: SecurityEventsService,
  ) {}

  async listForSuperAdmin() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        memberships: {
          include: { tenant: { select: { id: true, name: true } } },
        },
      },
    });

    const recipients = await this.prisma.mailRecipient.findMany({
      where: { emailCanonical: { in: users.map((u) => u.emailNormalized) } },
      select: { emailCanonical: true, state: true },
    });
    const states = new Map(recipients.map((r) => [r.emailCanonical, r.state]));
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      isSuperAdmin: u.isSuperAdmin,
      emailVerified: !!u.emailVerifiedAt,
      emailNormalized: u.emailNormalized,
      emailSuppressed: states.get(u.emailNormalized) === 'SUPPRESSED',
      isSuspended: u.isSuspended,
      suspendedAt: u.suspendedAt,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      memberships: u.memberships.map((m) => ({
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        role: m.role,
      })),
    }));
  }

  async suspend(userId: string, actor: AnyAccessTokenPayload) {
    return serial(this.prisma, async (tx) => {
      await this.sessions.live(tx, actor);
      if (actor.type !== 'superadmin') throw authError('FORBIDDEN', 403);
      await this.assertNotLastSuperadmin(tx, userId);
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          isSuspended: true,
          suspendedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      });
      await this.sessions.invalidateUser(tx, userId, 'user-suspended');
      await this.events.record(
        tx,
        'USER_SUSPENDED',
        actor.sub,
        actor.sessionId,
        { targetUserId: userId },
      );
      return {
        id: updated.id,
        isSuspended: updated.isSuspended,
        suspendedAt: updated.suspendedAt,
      };
    });
  }
  private async assertNotLastSuperadmin(tx: Tx, userId: string) {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${'superadmin-management'},0))`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw authError('NOT_FOUND', 404);
    if (
      user.isSuperAdmin &&
      !user.isSuspended &&
      (await tx.user.count({
        where: { isSuperAdmin: true, isSuspended: false },
      })) <= 1
    )
      throw authError('LAST_SUPERADMIN', 409);
  }

  async reactivate(userId: string, actor: AnyAccessTokenPayload) {
    return serial(this.prisma, async (tx) => {
      await this.sessions.live(tx, actor);
      if (actor.type !== 'superadmin') throw authError('FORBIDDEN', 403);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw authError('NOT_FOUND', 404);
      if (!user.isSuspended) throw authError('ALREADY_ACTIVE');
      const updated = await tx.user.update({
        where: { id: userId },
        data: { isSuspended: false, suspendedAt: null },
      });
      await this.events.record(
        tx,
        'USER_REACTIVATED',
        actor.sub,
        actor.sessionId,
        { targetUserId: userId },
      );
      return { id: updated.id, isSuspended: false, suspendedAt: null };
    });
  }

  /**
   * Deleting a User cascades through every Membership they hold (and
   * everything scoped to each — attempts, grades, group membership, ...),
   * but two things can make that cascade unsafe or undesirable, so both are
   * checked up front rather than surfacing a raw FK-violation or silently
   * orphaning a workspace:
   *  - `Quiz.createdByMembershipId` / `QuizAssignment.assignedByMembershipId`
   *    are ON DELETE RESTRICT (unlike the rest of Membership's dependents,
   *    which cascade or set-null) — deleting a Membership that authored a
   *    quiz or assignment still in use would otherwise fail as a raw
   *    Postgres constraint error.
   *  - a user who is the *only* admin of a tenant would leave it with no
   *    admin at all.
   */
  async remove(
    userId: string,
    emailConfirmation: string,
    actor: AnyAccessTokenPayload,
  ) {
    return serial(this.prisma, async (tx) => {
      await this.sessions.live(tx, actor);
      if (actor.type !== 'superadmin') throw authError('FORBIDDEN', 403);
      await this.assertNotLastSuperadmin(tx, userId);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }
      if (
        user.emailNormalized !==
        normalizeIdentifier(emailConfirmation).normalized
      ) {
        throw new BadRequestException('Email confirmation does not match');
      }

      const memberships = await tx.membership.findMany({
        where: { userId },
        include: { tenant: { select: { name: true } } },
      });

      for (const m of memberships.filter((m) => m.role === Role.ADMIN)) {
        const adminCount = await tx.membership.count({
          where: { tenantId: m.tenantId, role: Role.ADMIN },
        });
        if (adminCount <= 1) {
          throw new BadRequestException(
            `Cannot delete: this user is the only admin of "${m.tenant.name}". Promote another member to admin there first, or delete that workspace instead.`,
          );
        }
      }

      const membershipIds = memberships.map((m) => m.id);
      if (membershipIds.length > 0) {
        const [createdQuiz, assignedQuiz] = await Promise.all([
          tx.quiz.findFirst({
            where: { createdByMembershipId: { in: membershipIds } },
          }),
          tx.quizAssignment.findFirst({
            where: { assignedByMembershipId: { in: membershipIds } },
          }),
        ]);
        if (createdQuiz || assignedQuiz) {
          throw new BadRequestException(
            'Cannot delete: this user has created quizzes or assignments still in use. Remove or reassign that content first, or delete the workspace instead.',
          );
        }
      }

      await this.events.record(tx, 'USER_DELETED', actor.sub, actor.sessionId, {
        targetUserId: userId,
      });
      await tx.user.delete({ where: { id: userId } });
      return { id: userId };
    });
  }
}
