import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { assertPasswordNotReused, pushPasswordHistory } from '../common/password-history';
import { PrismaService } from '../prisma/prisma.service';
import { DeleteUserDto } from './dto/delete-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listForSuperAdmin() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        memberships: {
          include: { tenant: { select: { id: true, name: true } } },
        },
      },
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      isSuperAdmin: u.isSuperAdmin,
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

  async update(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) {
        throw new ConflictException('An account with this email already exists');
      }
    }
    if (dto.newPassword) {
      await assertPasswordNotReused(dto.newPassword, user.passwordHash, user.previousPasswordHashes);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name ?? undefined,
        email: dto.email ?? undefined,
        passwordHash: dto.newPassword ? await bcrypt.hash(dto.newPassword, 10) : undefined,
        previousPasswordHashes: dto.newPassword
          ? pushPasswordHistory(user.previousPasswordHashes, user.passwordHash)
          : undefined,
        // An admin-initiated reset (no currentPassword check, unlike the
        // user's own profile page) should log the account out everywhere —
        // that's the whole point of resetting a possibly-compromised
        // password.
        tokenVersion: dto.newPassword ? { increment: 1 } : undefined,
      },
    });
    return { id: updated.id, name: updated.name, email: updated.email };
  }

  async suspend(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.isSuperAdmin) {
      throw new BadRequestException('Super admin accounts cannot be suspended');
    }
    if (user.isSuspended) {
      throw new BadRequestException('This account is already suspended');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isSuspended: true, suspendedAt: new Date() },
    });
    return { id: updated.id, isSuspended: updated.isSuspended, suspendedAt: updated.suspendedAt };
  }

  async reactivate(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.isSuspended) {
      throw new BadRequestException('This account is already active');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isSuspended: false, suspendedAt: null },
    });
    return { id: updated.id, isSuspended: updated.isSuspended, suspendedAt: updated.suspendedAt };
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
  async remove(userId: string, emailConfirmation: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.isSuperAdmin) {
      throw new BadRequestException('Super admin accounts cannot be deleted');
    }
    if (user.email !== emailConfirmation) {
      throw new BadRequestException('Email confirmation does not match');
    }

    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { tenant: { select: { name: true } } },
    });

    for (const m of memberships.filter((m) => m.role === Role.ADMIN)) {
      const adminCount = await this.prisma.membership.count({
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
        this.prisma.quiz.findFirst({
          where: { createdByMembershipId: { in: membershipIds } },
        }),
        this.prisma.quizAssignment.findFirst({
          where: { assignedByMembershipId: { in: membershipIds } },
        }),
      ]);
      if (createdQuiz || assignedQuiz) {
        throw new BadRequestException(
          'Cannot delete: this user has created quizzes or assignments still in use. Remove or reassign that content first, or delete the workspace instead.',
        );
      }
    }

    await this.prisma.user.delete({ where: { id: userId } });
    return { id: userId };
  }
}
