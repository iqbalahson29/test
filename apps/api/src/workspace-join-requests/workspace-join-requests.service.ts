import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, TenantRequestStatus } from '@prisma/client';
import { randomInt } from 'crypto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { JoinByCodeDto } from './dto/join-by-code.dto';
import { SetJoinCodeDto } from './dto/set-join-code.dto';
import { UpdateTenantProfileDto } from './dto/update-tenant-profile.dto';

// Excludes visually ambiguous characters (0/O, 1/I) so a code read aloud or
// hand-copied from a whiteboard doesn't get mistyped.
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const JOIN_CODE_LENGTH = 7;
const MAX_GENERATE_ATTEMPTS = 10;

function randomJoinCode(): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

@Injectable()
export class WorkspaceJoinRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  async findBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        description: true,
        bannerImageUrl: true,
        _count: { select: { memberships: true } },
      },
    });
    if (!tenant) {
      throw new NotFoundException('Workspace not found');
    }
    return {
      id: tenant.id,
      name: tenant.name,
      description: tenant.description,
      bannerImageUrl: tenant.bannerImageUrl,
      memberCount: tenant._count.memberships,
    };
  }

  async getOwnTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        bannerImageUrl: true,
        joinCode: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException('Workspace not found');
    }
    return tenant;
  }

  async updateOwnTenant(
    tenantId: string,
    actorMembershipId: string | null,
    dto: UpdateTenantProfileDto,
  ) {
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        description:
          dto.description !== undefined ? dto.description.trim() || null : undefined,
        bannerImageUrl:
          dto.bannerImageUrl !== undefined ? dto.bannerImageUrl || null : undefined,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        bannerImageUrl: true,
      },
    });
    await this.auditLog.log(tenantId, null, actorMembershipId, 'WORKSPACE_PROFILE_UPDATED');
    return updated;
  }

  async setJoinCode(
    tenantId: string,
    actorMembershipId: string | null,
    dto: SetJoinCodeDto,
  ) {
    const joinCode = dto.joinCode.trim().toUpperCase();
    try {
      const updated = await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { joinCode },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          bannerImageUrl: true,
          joinCode: true,
        },
      });
      await this.auditLog.log(
        tenantId,
        null,
        actorMembershipId,
        'WORKSPACE_JOIN_CODE_UPDATED',
        'Set a custom join code',
      );
      return updated;
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException('That code is already in use — try another one');
      }
      throw err;
    }
  }

  async generateJoinCode(tenantId: string, actorMembershipId: string | null) {
    for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
      try {
        const updated = await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { joinCode: randomJoinCode() },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            bannerImageUrl: true,
            joinCode: true,
          },
        });
        await this.auditLog.log(
          tenantId,
          null,
          actorMembershipId,
          'WORKSPACE_JOIN_CODE_UPDATED',
          'Generated a new join code',
        );
        return updated;
      } catch (err) {
        if (!isUniqueConstraintError(err)) {
          throw err;
        }
      }
    }
    throw new ConflictException('Could not generate a unique code — please try again');
  }

  async clearJoinCode(tenantId: string, actorMembershipId: string | null) {
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { joinCode: null },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        bannerImageUrl: true,
        joinCode: true,
      },
    });
    await this.auditLog.log(
      tenantId,
      null,
      actorMembershipId,
      'WORKSPACE_JOIN_CODE_UPDATED',
      'Disabled the join code',
    );
    return updated;
  }

  async joinByCode(userId: string, dto: JoinByCodeDto) {
    const joinCode = dto.code.trim().toUpperCase();
    if (!joinCode) {
      throw new BadRequestException('Enter a workspace code');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { joinCode } });
    if (!tenant) {
      throw new NotFoundException('That code doesn’t match any workspace');
    }

    const existingMembership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId: tenant.id } },
    });
    if (existingMembership) {
      throw new ConflictException('You are already a member of this workspace');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    const membership = await this.prisma.membership.create({
      data: { userId, tenantId: tenant.id, role: Role.STUDENT },
    });

    // A code-based join is instant, so any stray pending request for the
    // same workspace would otherwise sit there showing "Pending" forever.
    await this.prisma.workspaceJoinRequest.deleteMany({
      where: { userId, tenantId: tenant.id, status: TenantRequestStatus.PENDING },
    });

    await this.auditLog.log(tenant.id, null, null, 'MEMBER_JOINED', user?.name ?? undefined);
    await this.notifications.notifyAdmins(tenant.id, {
      type: 'MEMBER_JOINED',
      title: 'New member joined',
      body: user?.name ? `${user.name} joined the workspace.` : 'A new member joined the workspace.',
      link: '/admin/members',
    });

    return {
      membershipId: membership.id,
      tenantId: tenant.id,
      tenantName: tenant.name,
    };
  }

  async directory(userId: string) {
    const [tenants, memberships, pendingRequests] = await Promise.all([
      this.prisma.tenant.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          _count: { select: { memberships: true } },
        },
      }),
      this.prisma.membership.findMany({
        where: { userId },
        select: { tenantId: true },
      }),
      this.prisma.workspaceJoinRequest.findMany({
        where: { userId, status: TenantRequestStatus.PENDING },
        select: { tenantId: true },
      }),
    ]);

    const memberTenantIds = new Set(memberships.map((m) => m.tenantId));
    const pendingTenantIds = new Set(pendingRequests.map((r) => r.tenantId));

    return tenants.map((t) => ({
      tenantId: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      memberCount: t._count.memberships,
      membershipStatus: memberTenantIds.has(t.id)
        ? ('MEMBER' as const)
        : pendingTenantIds.has(t.id)
          ? ('PENDING' as const)
          : null,
    }));
  }

  async create(userId: string, tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Workspace not found');
    }

    const existingMembership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (existingMembership) {
      throw new ConflictException('You are already a member of this workspace');
    }

    const existingPending = await this.prisma.workspaceJoinRequest.findFirst({
      where: { userId, tenantId, status: TenantRequestStatus.PENDING },
    });
    if (existingPending) {
      throw new ConflictException('You already have a pending request for this workspace');
    }

    return this.prisma.workspaceJoinRequest.create({
      data: { userId, tenantId, status: TenantRequestStatus.PENDING },
    });
  }

  async cancel(userId: string, requestId: string) {
    const request = await this.prisma.workspaceJoinRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.userId !== userId) {
      throw new NotFoundException('Join request not found');
    }
    if (request.status !== TenantRequestStatus.PENDING) {
      throw new BadRequestException('Only a pending request can be cancelled');
    }
    await this.prisma.workspaceJoinRequest.delete({ where: { id: requestId } });
  }

  async mine(userId: string) {
    const requests = await this.prisma.workspaceJoinRequest.findMany({
      where: { userId },
      include: { tenant: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((r) => ({
      id: r.id,
      tenantName: r.tenant.name,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  async listPendingForTenant(tenantId: string) {
    const requests = await this.prisma.workspaceJoinRequest.findMany({
      where: { tenantId, status: TenantRequestStatus.PENDING },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return requests.map((r) => ({
      id: r.id,
      user: r.user,
      createdAt: r.createdAt,
    }));
  }

  async approve(tenantId: string, requestId: string, actorMembershipId: string | null) {
    const request = await this.getPendingRequestOrThrow(tenantId, requestId);

    // Guard against the student having been separately added (e.g. via
    // assign-by-email) while this request was still pending.
    let membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId: request.userId, tenantId } },
    });
    if (!membership) {
      membership = await this.prisma.membership.create({
        data: { userId: request.userId, tenantId, role: Role.STUDENT },
      });
    }

    const updated = await this.prisma.workspaceJoinRequest.update({
      where: { id: requestId },
      data: { status: TenantRequestStatus.APPROVED, reviewedAt: new Date() },
    });
    await this.auditLog.log(
      tenantId,
      null,
      actorMembershipId,
      'MEMBER_JOINED',
      request.user.name,
    );
    await this.notifications.create(membership.id, {
      tenantId,
      type: 'JOIN_REQUEST_APPROVED',
      title: 'Join request approved',
      body: 'Your request to join this workspace was approved.',
      link: '/student',
    });
    await this.notifications.notifyAdmins(
      tenantId,
      {
        type: 'MEMBER_JOINED',
        title: 'New member joined',
        body: `${request.user.name} joined the workspace.`,
        link: '/admin/members',
      },
      actorMembershipId ?? undefined,
    );
    return updated;
  }

  async reject(tenantId: string, requestId: string, actorMembershipId: string | null) {
    const request = await this.getPendingRequestOrThrow(tenantId, requestId);
    const updated = await this.prisma.workspaceJoinRequest.update({
      where: { id: requestId },
      data: { status: TenantRequestStatus.REJECTED, reviewedAt: new Date() },
    });
    await this.auditLog.log(
      tenantId,
      null,
      actorMembershipId,
      'JOIN_REQUEST_REJECTED',
      request.user.name,
    );
    return updated;
  }

  private async getPendingRequestOrThrow(tenantId: string, requestId: string) {
    const request = await this.prisma.workspaceJoinRequest.findUnique({
      where: { id: requestId },
      include: { user: { select: { name: true } } },
    });
    if (!request || request.tenantId !== tenantId) {
      throw new NotFoundException('Join request not found');
    }
    if (request.status !== TenantRequestStatus.PENDING) {
      throw new BadRequestException('This request has already been reviewed');
    }
    return request;
  }
}
