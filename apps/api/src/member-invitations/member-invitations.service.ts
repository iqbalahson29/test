import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemberInvitationStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type CreateOneResult =
  | { status: 'added'; id: string; email: string; role: Role }
  | { status: 'invited'; id: string; email: string; role: Role; token: string };

@Injectable()
export class MemberInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(tenantId: string) {
    const invitations = await this.prisma.memberInvitation.findMany({
      where: { tenantId, status: MemberInvitationStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      token: i.token,
      createdAt: i.createdAt,
    }));
  }

  create(tenantId: string, dto: { email: string; role: Role }, actorMembershipId: string | null) {
    return this.createOne(tenantId, dto.email, dto.role, actorMembershipId);
  }

  async bulkCreate(
    tenantId: string,
    entries: { email: string; role: Role }[],
    actorMembershipId: string | null,
  ) {
    const added: CreateOneResult[] = [];
    const invited: CreateOneResult[] = [];
    const failed: { email: string; reason: string }[] = [];

    for (const entry of entries) {
      try {
        const result = await this.createOne(tenantId, entry.email, entry.role, actorMembershipId);
        if (result.status === 'added') {
          added.push(result);
        } else {
          invited.push(result);
        }
      } catch (err) {
        failed.push({
          email: entry.email,
          reason: err instanceof Error ? err.message : 'Could not add this member',
        });
      }
    }

    return { added, invited, failed };
  }

  private async createOne(
    tenantId: string,
    email: string,
    role: Role,
    actorMembershipId: string | null,
  ): Promise<CreateOneResult> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: true },
    });

    if (user) {
      const alreadyInTenant = user.memberships.some((m) => m.tenantId === tenantId);
      if (alreadyInTenant) {
        throw new ConflictException('This user already belongs to this workspace');
      }
      const membership = await this.prisma.membership.create({
        data: { userId: user.id, tenantId, role },
      });
      await this.auditLog.log(tenantId, null, actorMembershipId, 'MEMBER_ADDED', user.name);
      return { status: 'added', id: membership.id, email: user.email, role: membership.role };
    }

    const existingPending = await this.prisma.memberInvitation.findFirst({
      where: { tenantId, email, status: MemberInvitationStatus.PENDING },
    });
    if (existingPending) {
      throw new ConflictException('There is already a pending invite for this email');
    }

    const token = randomBytes(24).toString('hex');
    const invitation = await this.prisma.memberInvitation.create({
      data: { tenantId, email, role, token, invitedByMembershipId: actorMembershipId },
    });
    await this.auditLog.log(tenantId, null, actorMembershipId, 'MEMBER_INVITED', email);
    return { status: 'invited', id: invitation.id, email, role, token };
  }

  async revoke(tenantId: string, id: string, actorMembershipId: string | null) {
    const invitation = await this.prisma.memberInvitation.findUnique({ where: { id } });
    if (!invitation || invitation.tenantId !== tenantId) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status !== MemberInvitationStatus.PENDING) {
      throw new BadRequestException('This invitation is no longer pending');
    }

    await this.prisma.memberInvitation.update({
      where: { id },
      data: { status: MemberInvitationStatus.REVOKED },
    });
    await this.auditLog.log(tenantId, null, actorMembershipId, 'INVITE_REVOKED', invitation.email);
    return { id };
  }

  async findByToken(token: string) {
    const invitation = await this.prisma.memberInvitation.findUnique({
      where: { token },
      include: { tenant: { select: { name: true } } },
    });
    if (!invitation || invitation.status !== MemberInvitationStatus.PENDING) {
      throw new NotFoundException('This invite is invalid or no longer available');
    }
    return { tenantName: invitation.tenant.name, email: invitation.email, role: invitation.role };
  }

  async accept(token: string, name: string, password: string) {
    const invitation = await this.prisma.memberInvitation.findUnique({ where: { token } });
    if (!invitation || invitation.status !== MemberInvitationStatus.PENDING) {
      throw new NotFoundException('This invite is invalid or no longer available');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });

    let userId: string;
    if (existingUser) {
      // Rare: the invitee already registered separately before accepting.
      // Reuse their account and its existing password rather than touching it.
      userId = existingUser.id;
      const alreadyMember = await this.prisma.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId: invitation.tenantId } },
      });
      if (!alreadyMember) {
        await this.prisma.membership.create({
          data: { userId, tenantId: invitation.tenantId, role: invitation.role },
        });
      }
    } else {
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await this.prisma.user.create({
        data: { email: invitation.email, name, passwordHash },
      });
      userId = user.id;
      await this.prisma.membership.create({
        data: { userId, tenantId: invitation.tenantId, role: invitation.role },
      });
    }

    await this.prisma.memberInvitation.update({
      where: { id: invitation.id },
      data: { status: MemberInvitationStatus.ACCEPTED, acceptedAt: new Date() },
    });
    await this.auditLog.log(
      invitation.tenantId,
      null,
      null,
      'INVITE_ACCEPTED',
      existingUser ? existingUser.name : name,
    );
    await this.notifications.notifyAdmins(invitation.tenantId, {
      type: 'INVITE_ACCEPTED',
      title: 'New member joined',
      body: `${existingUser ? existingUser.name : name} accepted their invite.`,
      link: '/admin/members',
    });

    return { id: userId, email: invitation.email };
  }
}
