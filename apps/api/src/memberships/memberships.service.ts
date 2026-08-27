import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMembershipDto } from './dto/create-membership.dto';

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      id: m.id,
      role: m.role,
      user: m.user,
    }));
  }

  async create(tenantId: string, dto: CreateMembershipDto) {
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

  async remove(tenantId: string, membershipId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });
    if (!membership || membership.tenantId !== tenantId) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.role === Role.ADMIN) {
      const adminCount = await this.prisma.membership.count({
        where: { tenantId, role: Role.ADMIN },
      });
      if (adminCount <= 1) {
        throw new BadRequestException(
          "Cannot remove this tenant's last admin",
        );
      }
    }

    await this.prisma.membership.delete({ where: { id: membershipId } });
    return { id: membershipId };
  }
}
