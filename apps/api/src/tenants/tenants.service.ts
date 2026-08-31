import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async suspend(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Workspace not found');
    }
    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new BadRequestException('Workspace is already suspended');
    }
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TenantStatus.SUSPENDED, suspendedAt: new Date() },
    });
  }

  async reactivate(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Workspace not found');
    }
    if (tenant.status === TenantStatus.ACTIVE) {
      throw new BadRequestException('Workspace is already active');
    }
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TenantStatus.ACTIVE, suspendedAt: null },
    });
  }

  /**
   * Permanently deletes a workspace and everything scoped to it (cascades
   * through memberships, quizzes/questions, attempts, assignments, groups,
   * etc. via the FK `onDelete: Cascade` relations already declared on those
   * models). `slugConfirmation` is a server-side re-check of the same
   * "type the slug to confirm" the client requires — the client-side check
   * alone is just UX, not a real guard against a stray/replayed request.
   */
  async remove(tenantId: string, slugConfirmation: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Workspace not found');
    }
    if (tenant.slug !== slugConfirmation) {
      throw new BadRequestException('Workspace slug confirmation does not match');
    }
    await this.prisma.tenant.delete({ where: { id: tenantId } });
    return { id: tenantId };
  }
}
