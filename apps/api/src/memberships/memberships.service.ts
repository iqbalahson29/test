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

    // A user can belong to at most one tenant, ever.
    if (user.memberships.length > 0) {
      throw new ConflictException('This user already belongs to a workspace');
    }

    const membership = await this.prisma.membership.create({
      data: { userId: user.id, tenantId, role: dto.role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return { id: membership.id, role: membership.role, user: membership.user };
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
