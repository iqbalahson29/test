import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, TenantRequestStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantRequestDto } from './dto/create-tenant-request.dto';

const requestSelect = {
  id: true,
  workspaceName: true,
  slug: true,
  requesterName: true,
  requesterEmail: true,
  status: true,
  tenantId: true,
  createdAt: true,
  reviewedAt: true,
} as const;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class TenantRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantRequestDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.requesterEmail },
      include: { memberships: true },
    });
    if (existingUser && existingUser.memberships.length > 0) {
      throw new ConflictException(
        'This email already belongs to a workspace',
      );
    }

    const slug = await this.uniqueSlug(dto.workspaceName);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.tenantRequest.create({
      data: {
        workspaceName: dto.workspaceName,
        slug,
        requesterName: dto.requesterName,
        requesterEmail: dto.requesterEmail,
        passwordHash,
      },
      select: requestSelect,
    });
  }

  list(status?: TenantRequestStatus) {
    return this.prisma.tenantRequest.findMany({
      where: status ? { status } : undefined,
      select: requestSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  async approve(id: string) {
    const request = await this.prisma.tenantRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException('Tenant request not found');
    }
    if (request.status !== TenantRequestStatus.PENDING) {
      throw new BadRequestException('This request has already been reviewed');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: request.requesterEmail },
      include: { memberships: true },
    });
    if (existingUser && existingUser.memberships.length > 0) {
      throw new ConflictException(
        'This email already belongs to a workspace',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: request.workspaceName, slug: request.slug },
      });

      const user = existingUser
        ? existingUser
        : await tx.user.create({
            data: {
              email: request.requesterEmail,
              name: request.requesterName,
              passwordHash: request.passwordHash,
            },
          });

      await tx.membership.create({
        data: { userId: user.id, tenantId: tenant.id, role: Role.ADMIN },
      });

      return tx.tenantRequest.update({
        where: { id },
        data: {
          status: TenantRequestStatus.APPROVED,
          tenantId: tenant.id,
          reviewedAt: new Date(),
        },
        select: requestSelect,
      });
    });
  }

  async reject(id: string) {
    const request = await this.prisma.tenantRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException('Tenant request not found');
    }
    if (request.status !== TenantRequestStatus.PENDING) {
      throw new BadRequestException('This request has already been reviewed');
    }

    return this.prisma.tenantRequest.update({
      where: { id },
      data: { status: TenantRequestStatus.REJECTED, reviewedAt: new Date() },
      select: requestSelect,
    });
  }

  private async uniqueSlug(workspaceName: string): Promise<string> {
    const base = slugify(workspaceName) || 'workspace';
    let candidate = base;
    let suffix = 2;
    while (await this.slugTaken(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  private async slugTaken(slug: string): Promise<boolean> {
    const [tenant, request] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { slug } }),
      this.prisma.tenantRequest.findUnique({ where: { slug } }),
    ]);
    return Boolean(tenant || request);
  }
}
