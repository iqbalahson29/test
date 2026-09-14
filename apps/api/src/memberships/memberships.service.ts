import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { IdentifierService } from '../auth/identifier.service';
import { PasswordService } from '../auth/password.service';
import { SessionService } from '../auth/session.service';
import { SecurityEventsService } from '../auth/security/security-events.service';
import {
  serial,
  mailboxLock,
  authError,
  Tx,
} from '../auth/security/primitives';
import type { AccessTokenPayload } from '../auth/token.types';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMembershipDto } from './dto/create-membership.dto';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly identifiers: IdentifierService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly events: SecurityEventsService,
  ) {}

  async list(tenantId: string) {
    const memberships = await this.prisma.membership.findMany({
      // Platform super admins never appear as a workspace's own member —
      // their membership here exists only to reuse the ADMIN permission
      // machinery for the "enter workspace" super admin feature, not as a
      // real, workspace-facing member.
      where: { tenantId, user: { isSuperAdmin: false } },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      id: m.id,
      role: m.role,
      createdAt: m.createdAt,
      user: m.user,
    }));
  }

  /** Admin-facing read of one member's full profile — everything a
   * self-service `GET /auth/profile` would show, plus the role/joinedAt
   * that only make sense from the membership side. */
  async findOne(tenantId: string, membershipId: string) {
    const membership = await this.prisma.membership.findFirst({
      // findFirst (not findUnique) so the isSuperAdmin exclusion below can
      // be part of the same query — a super admin's membership is hidden
      // from this tenant-facing endpoint the same as it is from list().
      where: { id: membershipId, user: { isSuperAdmin: false } },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            bio: true,
            phone: true,
            location: true,
            timezone: true,
            locale: true,
            gradeLevel: true,
            studentId: true,
            guardianName: true,
            guardianContact: true,
            lastLoginAt: true,
          },
        },
      },
    });
    if (!membership || membership.tenantId !== tenantId) {
      throw new NotFoundException('Membership not found');
    }

    const groupMemberships = await this.prisma.groupMember.findMany({
      where: { membershipId },
      include: { group: true },
    });

    return {
      id: membership.id,
      role: membership.role,
      joinedAt: membership.createdAt,
      user: membership.user,
      groups: groupMemberships.map((gm) => ({
        id: gm.group.id,
        name: gm.group.name,
      })),
    };
  }

  async create(
    tenantId: string,
    dto: CreateMembershipDto,
    actor: AccessTokenPayload,
  ) {
    const email = this.identifiers.normalize(dto.email),
      hash = dto.password ? await this.passwords.hash(dto.password) : null;
    return serial(this.prisma, async (tx) => {
      await mailboxLock(tx, email.normalized);
      await this.sessions.live(tx, actor);
      if (actor.tenantId !== tenantId || actor.role !== 'ADMIN')
        throw authError('FORBIDDEN', 403);
      let user = await tx.user.findUnique({
        where: { emailNormalized: email.normalized },
      });
      if (!user) {
        if (!hash || !dto.name) throw authError('VALIDATION_ERROR');
        user = await tx.user.create({
          data: {
            email: email.raw,
            emailNormalized: email.normalized,
            name: dto.name,
            passwordHash: hash,
            emailVerifiedAt: null,
          },
        });
        await tx.authIdentity.create({
          data: {
            userId: user.id,
            provider: 'PASSWORD',
            providerUserId: user.id,
          },
        });
      }
      if (
        await tx.membership.findUnique({
          where: { userId_tenantId: { userId: user.id, tenantId } },
        })
      )
        throw authError('MEMBERSHIP_EXISTS', 409);
      const membership = await tx.membership.create({
        data: { userId: user.id, tenantId, role: dto.role },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      await this.events.record(
        tx,
        'MEMBERSHIP_CREATED',
        actor.sub,
        actor.sessionId,
        { targetUserId: user.id, tenantId },
      );
      return {
        id: membership.id,
        role: membership.role,
        user: membership.user,
      };
    });
  }

  /**
   * Used by AssignmentsService's assign-by-email flow: finds an existing
   * user by email and returns (or creates) their STUDENT membership in this
   * tenant. Unlike create() above, this never creates a brand-new User —
   * only the public self-registration endpoint does that.
   */
  async findOrCreateStudentMembershipByEmail(tenantId: string, email: string) {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: this.identifiers.normalize(email).normalized },
      include: { memberships: true },
    });
    if (!user) {
      throw new BadRequestException(
        'No account found for this email — the student needs to create an account first',
      );
    }

    const existing = user.memberships.find((m) => m.tenantId === tenantId);
    if (existing) {
      if (existing.role !== Role.STUDENT) {
        throw new ConflictException(
          'This user already has a different role in this workspace',
        );
      }
      return existing;
    }

    return this.prisma.membership.create({
      data: { userId: user.id, tenantId, role: Role.STUDENT },
    });
  }

  async remove(
    tenantId: string,
    membershipId: string,
    actor: AccessTokenPayload,
  ) {
    return serial(this.prisma, async (tx) => {
      await this.sessions.live(tx, actor);
      if (actor.tenantId !== tenantId || actor.role !== 'ADMIN')
        throw authError('FORBIDDEN', 403);
      const membership = await tx.membership.findFirst({
        where: { id: membershipId, tenantId },
        include: { user: true },
      });
      if (!membership) throw authError('NOT_FOUND', 404);
      if (membership.role === 'ADMIN')
        await this.assertNotLastAdmin(tx, tenantId);
      const sessions = await tx.session.findMany({
        where: { membershipId, revokedAt: null },
        select: { id: true },
      });
      for (const session of sessions)
        await this.sessions.revoke(tx, session.id, 'membership-removed');
      await tx.membership.delete({ where: { id: membershipId } });
      await this.events.record(
        tx,
        'MEMBERSHIP_REMOVED',
        actor.sub,
        actor.sessionId,
        { membershipId, tenantId },
      );
      return { id: membershipId };
    });
  }
  async updateRole(
    tenantId: string,
    membershipId: string,
    role: Role,
    actor: AccessTokenPayload,
  ) {
    return serial(this.prisma, async (tx) => {
      await this.sessions.live(tx, actor);
      if (actor.tenantId !== tenantId || actor.role !== 'ADMIN')
        throw authError('FORBIDDEN', 403);
      const membership = await tx.membership.findFirst({
        where: { id: membershipId, tenantId },
      });
      if (!membership) throw authError('NOT_FOUND', 404);
      if (membership.role === 'ADMIN' && role !== 'ADMIN')
        await this.assertNotLastAdmin(tx, tenantId);
      if (membership.role !== role) {
        const sessions = await tx.session.findMany({
          where: { membershipId, revokedAt: null },
          select: { id: true },
        });
        for (const session of sessions)
          await this.sessions.revoke(tx, session.id, 'role-changed');
      }
      const updated = await tx.membership.update({
        where: { id: membershipId },
        data: { role },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      await this.events.record(
        tx,
        'MEMBERSHIP_ROLE_CHANGED',
        actor.sub,
        actor.sessionId,
        { membershipId, tenantId },
      );
      return { id: updated.id, role: updated.role, user: updated.user };
    });
  }
  private async assertNotLastAdmin(tx: Tx, tenantId: string) {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${'tenant-admin:' + tenantId},0))`;
    if (
      (await tx.membership.count({
        where: { tenantId, role: 'ADMIN', user: { isSuperAdmin: false } },
      })) <= 1
    )
      throw new BadRequestException("Cannot remove this tenant's last admin");
  }
}
