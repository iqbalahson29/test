import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMembershipDto } from './dto/create-membership.dto';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
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
      groups: groupMemberships.map((gm) => ({ id: gm.group.id, name: gm.group.name })),
    };
  }

  async create(tenantId: string, dto: CreateMembershipDto, actorMembershipId: string | null) {
    let user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { memberships: true },
    });

    if (!user) {
      if (!dto.name || !dto.password) {
        throw new BadRequestException(
          'name and password are required to create a new user',
        );
      }
      const passwordHash = await bcrypt.hash(dto.password, 10);
      user = await this.prisma.user.create({
        data: { email: dto.email, name: dto.name, passwordHash },
        include: { memberships: true },
      });
    }

    // A user can belong to at most one membership per tenant, but may
    // already be a member of other tenants — that's fine now.
    const alreadyInTenant = user.memberships.some((m) => m.tenantId === tenantId);
    if (alreadyInTenant) {
      throw new ConflictException('This user already belongs to this workspace');
    }

    const membership = await this.prisma.membership.create({
      data: { userId: user.id, tenantId, role: dto.role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    await this.auditLog.log(tenantId, null, actorMembershipId, 'MEMBER_ADDED', user.name);
    return { id: membership.id, role: membership.role, user: membership.user };
  }

  /**
   * Used by AssignmentsService's assign-by-email flow: finds an existing
   * user by email and returns (or creates) their STUDENT membership in this
   * tenant. Unlike create() above, this never creates a brand-new User —
   * only the public self-registration endpoint does that.
   */
  async findOrCreateStudentMembershipByEmail(tenantId: string, email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
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

  async remove(tenantId: string, membershipId: string, actorMembershipId: string | null) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: { user: { select: { name: true } } },
    });
    if (!membership || membership.tenantId !== tenantId) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.role === Role.ADMIN) {
      await this.assertNotLastAdmin(tenantId);
    }

    await this.prisma.membership.delete({ where: { id: membershipId } });
    await this.auditLog.log(
      tenantId,
      null,
      actorMembershipId,
      'MEMBER_REMOVED',
      membership.user.name,
    );
    return { id: membershipId };
  }

  async updateRole(
    tenantId: string,
    membershipId: string,
    role: Role,
    actorMembershipId: string | null,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: { user: { select: { name: true } } },
    });
    if (!membership || membership.tenantId !== tenantId) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.role === Role.ADMIN && role !== Role.ADMIN) {
      await this.assertNotLastAdmin(tenantId);
    }

    if (membership.role === role) {
      return { id: membership.id, role: membership.role, user: membership.user };
    }

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    await this.auditLog.log(
      tenantId,
      null,
      actorMembershipId,
      'MEMBER_ROLE_CHANGED',
      updated.user.name,
    );
    return { id: updated.id, role: updated.role, user: updated.user };
  }

  private async assertNotLastAdmin(tenantId: string) {
    // Excludes a super admin's own (hidden) membership — otherwise a tenant
    // whose only *visible* admin tries to step down would sail past this
    // check because the invisible super admin membership is still counted,
    // leaving the workspace with zero admins its own members can see.
    const adminCount = await this.prisma.membership.count({
      where: { tenantId, role: Role.ADMIN, user: { isSuperAdmin: false } },
    });
    if (adminCount <= 1) {
      throw new BadRequestException("Cannot remove this tenant's last admin");
    }
  }
}
