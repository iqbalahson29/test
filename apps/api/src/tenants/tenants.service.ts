import { Injectable } from '@nestjs/common';
import { SessionService } from '../auth/session.service';
import type { AnyAccessTokenPayload } from '../auth/token.types';
import { SecurityEventsService } from '../auth/security/security-events.service';
import { serial, authError } from '../auth/security/primitives';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly events: SecurityEventsService,
  ) {}

  async listForSuperAdmin() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            // Excludes a super admin's own membership (from "enter
            // workspace") — this is meant to reflect the workspace's real
            // size, not an artifact of the platform admin having visited it.
            memberships: { where: { user: { isSuperAdmin: false } } },
            quizzes: true,
            groups: true,
            assignments: true,
          },
        },
        quizzes: { select: { _count: { select: { attempts: true } } } },
      },
    });

    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      status: t.status,
      suspendedAt: t.suspendedAt,
      memberCount: t._count.memberships,
      quizCount: t._count.quizzes,
      groupCount: t._count.groups,
      assignmentCount: t._count.assignments,
      attemptCount: t.quizzes.reduce((sum, q) => sum + q._count.attempts, 0),
      createdAt: t.createdAt,
    }));
  }

  async suspend(tenantId: string, actor: AnyAccessTokenPayload) {
    return serial(this.prisma, async (tx) => {
      await this.sessions.live(tx, actor);
      if (actor.type !== 'superadmin') throw authError('FORBIDDEN', 403);
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw authError('NOT_FOUND', 404);
      if (tenant.status === 'SUSPENDED') throw authError('ALREADY_SUSPENDED');
      const sessions = await tx.session.findMany({
        where: { membership: { tenantId }, revokedAt: null },
        select: { id: true },
      });
      for (const s of sessions)
        await this.sessions.revoke(tx, s.id, 'tenant-suspended');
      const updated = await tx.tenant.update({
        where: { id: tenantId },
        data: { status: 'SUSPENDED', suspendedAt: new Date() },
      });
      await this.events.record(
        tx,
        'TENANT_SUSPENDED',
        actor.sub,
        actor.sessionId,
        { tenantId },
      );
      return updated;
    });
  }
  async reactivate(tenantId: string, actor: AnyAccessTokenPayload) {
    return serial(this.prisma, async (tx) => {
      await this.sessions.live(tx, actor);
      if (actor.type !== 'superadmin') throw authError('FORBIDDEN', 403);
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw authError('NOT_FOUND', 404);
      if (tenant.status === 'ACTIVE') throw authError('ALREADY_ACTIVE');
      const updated = await tx.tenant.update({
        where: { id: tenantId },
        data: { status: 'ACTIVE', suspendedAt: null },
      });
      await this.events.record(
        tx,
        'TENANT_REACTIVATED',
        actor.sub,
        actor.sessionId,
        { tenantId },
      );
      return updated;
    });
  }
  async remove(
    tenantId: string,
    slugConfirmation: string,
    actor: AnyAccessTokenPayload,
  ) {
    return serial(this.prisma, async (tx) => {
      await this.sessions.live(tx, actor);
      if (actor.type !== 'superadmin') throw authError('FORBIDDEN', 403);
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw authError('NOT_FOUND', 404);
      if (tenant.slug !== slugConfirmation)
        throw authError('INVALID_CONFIRMATION');
      const sessions = await tx.session.findMany({
        where: { membership: { tenantId }, revokedAt: null },
        select: { id: true },
      });
      for (const s of sessions)
        await this.sessions.revoke(tx, s.id, 'tenant-deleted');
      await this.events.record(
        tx,
        'TENANT_DELETED',
        actor.sub,
        actor.sessionId,
        { tenantId },
      );
      await tx.tenant.delete({ where: { id: tenantId } });
      return { id: tenantId };
    });
  }
}
