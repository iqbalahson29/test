import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, TenantRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkspaceJoinRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async directory(userId: string) {
    const [tenants, memberships, pendingRequests] = await Promise.all([
      this.prisma.tenant.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
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

  async approve(tenantId: string, requestId: string) {
    const request = await this.getPendingRequestOrThrow(tenantId, requestId);

    // Guard against the student having been separately added (e.g. via
    // assign-by-email) while this request was still pending.
    const existingMembership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId: request.userId, tenantId } },
    });
    if (!existingMembership) {
      await this.prisma.membership.create({
        data: { userId: request.userId, tenantId, role: Role.STUDENT },
      });
    }

    return this.prisma.workspaceJoinRequest.update({
      where: { id: requestId },
      data: { status: TenantRequestStatus.APPROVED, reviewedAt: new Date() },
    });
  }

  async reject(tenantId: string, requestId: string) {
    await this.getPendingRequestOrThrow(tenantId, requestId);
    return this.prisma.workspaceJoinRequest.update({
      where: { id: requestId },
      data: { status: TenantRequestStatus.REJECTED, reviewedAt: new Date() },
    });
  }

  private async getPendingRequestOrThrow(tenantId: string, requestId: string) {
    const request = await this.prisma.workspaceJoinRequest.findUnique({
      where: { id: requestId },
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
