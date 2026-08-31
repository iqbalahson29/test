import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Kept as a plain string union rather than a Prisma enum for the same
// reason as AuditLog.action: new notification types are cheap to add and
// don't need a migration. The frontend switches on it only to pick an icon.
export type NotificationType =
  | 'QUIZ_ASSIGNED'
  | 'JOIN_REQUEST_APPROVED'
  | 'JOIN_REQUEST_REJECTED'
  | 'MEMBER_JOINED'
  | 'INVITE_ACCEPTED'
  | 'RESPONSE_GRADED'
  | 'GRADING_PENDING'
  | 'WORKSPACE_REQUEST_SUBMITTED'
  | 'USER_REGISTERED';

interface CreateNotificationParams {
  tenantId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

interface CreateSuperAdminNotificationParams {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(membershipId: string, params: CreateNotificationParams) {
    return this.prisma.notification.create({
      data: { membershipId, ...params },
    });
  }

  async createMany(membershipIds: string[], params: CreateNotificationParams) {
    const uniqueIds = [...new Set(membershipIds)];
    if (uniqueIds.length === 0) return;
    await this.prisma.notification.createMany({
      data: uniqueIds.map((membershipId) => ({ membershipId, ...params })),
    });
  }

  /** Notifies every ADMIN membership in a tenant — e.g. "a new member joined". */
  async notifyAdmins(
    tenantId: string,
    params: Omit<CreateNotificationParams, 'tenantId'>,
    excludeMembershipId?: string,
  ) {
    const admins = await this.prisma.membership.findMany({
      where: {
        tenantId,
        role: Role.ADMIN,
        ...(excludeMembershipId ? { id: { not: excludeMembershipId } } : {}),
      },
      select: { id: true },
    });
    await this.createMany(
      admins.map((a) => a.id),
      { tenantId, ...params },
    );
  }

  /** Notifies every super admin account — for platform-level events (a new
   * workspace request, a new user registering) that have no tenant
   * membership to scope an ordinary notification to. Mirrors create()/
   * createMany() but targets User.recipientUserId instead of
   * Membership.membershipId. */
  async notifySuperAdmins(params: CreateSuperAdminNotificationParams) {
    const superAdmins = await this.prisma.user.findMany({
      where: { isSuperAdmin: true },
      select: { id: true },
    });
    if (superAdmins.length === 0) return;
    await this.prisma.notification.createMany({
      data: superAdmins.map((u) => ({ recipientUserId: u.id, ...params })),
    });
  }

  /** Cursor-paginated, newest first — powers both the header dropdown
   * (small `limit`, no cursor) and the "view all" dialog (loads more via
   * `cursor` = the previous page's `nextCursor`). */
  async list(
    membershipId: string,
    opts: { cursor?: string; limit?: number } = {},
  ) {
    const limit = Math.min(
      Math.max(opts.limit ?? DEFAULT_LIST_LIMIT, 1),
      MAX_LIST_LIMIT,
    );
    const items = await this.prisma.notification.findMany({
      where: { membershipId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  unreadCount(membershipId: string) {
    return this.prisma.notification.count({
      where: { membershipId, read: false },
    });
  }

  async markRead(membershipId: string, id: string) {
    const notification = await this.getOwnOrThrow(membershipId, id);
    if (notification.read) return notification;
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllRead(membershipId: string) {
    await this.prisma.notification.updateMany({
      where: { membershipId, read: false },
      data: { read: true },
    });
    return { ok: true };
  }

  async remove(membershipId: string, id: string) {
    await this.getOwnOrThrow(membershipId, id);
    await this.prisma.notification.delete({ where: { id } });
    return { id };
  }

  async clearAll(membershipId: string) {
    await this.prisma.notification.deleteMany({ where: { membershipId } });
    return { ok: true };
  }

  private async getOwnOrThrow(membershipId: string, id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification || notification.membershipId !== membershipId) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  // --- Super admin (recipientUserId-scoped) equivalents of the methods
  // above — kept as separate methods rather than a shared "scope" param so
  // the many existing membership-scoped call sites elsewhere in the app
  // (assignments, grading, invitations, ...) never have to change.

  async listForUser(userId: string, opts: { cursor?: string; limit?: number } = {}) {
    const limit = Math.min(
      Math.max(opts.limit ?? DEFAULT_LIST_LIMIT, 1),
      MAX_LIST_LIMIT,
    );
    const items = await this.prisma.notification.findMany({
      where: { recipientUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  unreadCountForUser(userId: string) {
    return this.prisma.notification.count({
      where: { recipientUserId: userId, read: false },
    });
  }

  async markReadForUser(userId: string, id: string) {
    const notification = await this.getOwnOrThrowForUser(userId, id);
    if (notification.read) return notification;
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllReadForUser(userId: string) {
    await this.prisma.notification.updateMany({
      where: { recipientUserId: userId, read: false },
      data: { read: true },
    });
    return { ok: true };
  }

  async removeForUser(userId: string, id: string) {
    await this.getOwnOrThrowForUser(userId, id);
    await this.prisma.notification.delete({ where: { id } });
    return { id };
  }

  async clearAllForUser(userId: string) {
    await this.prisma.notification.deleteMany({ where: { recipientUserId: userId } });
    return { ok: true };
  }

  private async getOwnOrThrowForUser(userId: string, id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification || notification.recipientUserId !== userId) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }
}
