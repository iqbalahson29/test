import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { maskEmail } from '@quiz-platform/shared';
import { PrismaService } from '../prisma/prisma.service';
import { IdentifierService } from '../auth/identifier.service';
import { PasswordService } from '../auth/password.service';
import {
  AuthClock,
  AuthRandom,
  DAY,
  Tx,
  authError,
  mailboxLock,
  plusMs,
  serial,
  sha256,
} from '../auth/security/primitives';
import { SessionService } from '../auth/session.service';
import { OtpService } from '../auth/otp.service';
import { AuthPolicyService } from '../auth/auth-policy.service';
import { SecurityEventsService } from '../auth/security/security-events.service';
import { RateLimitsService } from '../auth/security/rate-limits.service';
import { BrowserContext } from '../auth/security/cookies';
import { AnyAccessTokenPayload } from '../auth/token.types';
import { MailerService } from '../mailer/mailer.service';
@Injectable()
export class MemberInvitationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly identifiers: IdentifierService,
    private readonly passwords: PasswordService,
    private readonly clock: AuthClock,
    private readonly random: AuthRandom,
    private readonly sessions: SessionService,
    private readonly otp: OtpService,
    private readonly policy: AuthPolicyService,
    private readonly events: SecurityEventsService,
    private readonly rates: RateLimitsService,
    private readonly mail: MailerService,
  ) {}
  private async admin(tx: Tx, tenantId: string, actor: AnyAccessTokenPayload) {
    await this.sessions.live(tx, actor);
    if (
      actor.type !== 'access' ||
      actor.tenantId !== tenantId ||
      actor.role !== 'ADMIN'
    )
      throw authError('FORBIDDEN', 403);
  }
  async list(tenantId: string) {
    const now = this.clock.now();
    const rows = await this.db.memberInvitation.findMany({
      where: { tenantId, status: 'PENDING', expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      rows.map(async (i) => {
        const delivery = await this.db.mailOutbox.findFirst({
          where: {
            category: 'INVITE',
            payload: { path: ['invitationId'], equals: i.id },
          },
          orderBy: { createdAt: 'desc' },
          select: { status: true, lastErrorKind: true },
        });
        return {
          id: i.id,
          email: i.email,
          role: i.role,
          createdAt: i.createdAt,
          expiresAt: i.expiresAt,
          deliveryStatus: delivery?.status ?? 'PENDING',
          deliveryError: delivery?.lastErrorKind ?? null,
        };
      }),
    );
  }
  async create(
    tenantId: string,
    dto: { email: string; role: Role },
    actor: AnyAccessTokenPayload,
  ) {
    this.policy.enabled();
    const email = this.identifiers.normalize(dto.email);
    return serial(this.db, async (tx) => {
      await mailboxLock(tx, email.normalized);
      await this.admin(tx, tenantId, actor);
      const retry = await this.rates.bucket(
        tx,
        'invite-create',
        this.rates.hash('tenant', tenantId),
        50,
        DAY,
      );
      if (retry) return { error: true, retry } as const;
      const user = await tx.user.findUnique({
        where: { emailNormalized: email.normalized },
        include: { memberships: true },
      });
      if (user) {
        if (user.memberships.some((m) => m.tenantId === tenantId))
          throw authError('MEMBERSHIP_EXISTS', 409);
        const m = await tx.membership.create({
          data: { tenantId, userId: user.id, role: dto.role },
        });
        await this.events.record(
          tx,
          'MEMBERSHIP_CREATED',
          actor.sub,
          actor.sessionId,
          { targetUserId: user.id, tenantId },
        );
        return {
          status: 'added' as const,
          id: m.id,
          email: user.email,
          role: m.role,
        };
      }
      await tx.memberInvitation.updateMany({
        where: {
          tenantId,
          emailNormalized: email.normalized,
          status: 'PENDING',
          expiresAt: { lte: this.clock.now() },
        },
        data: { status: 'EXPIRED' },
      });
      if (
        await tx.memberInvitation.findFirst({
          where: {
            tenantId,
            emailNormalized: email.normalized,
            status: 'PENDING',
          },
        })
      )
        throw authError('INVITATION_EXISTS', 409);
      const token = this.random.token(),
        expiresAt = plusMs(this.clock.now(), 14 * DAY);
      const invite = await tx.memberInvitation.create({
        data: {
          tenantId,
          email: email.raw,
          emailNormalized: email.normalized,
          role: dto.role,
          tokenHash: sha256(token),
          expiresAt,
          invitedByMembershipId:
            actor.type === 'access' ? actor.membershipId : null,
          lastSentAt: this.clock.now(),
        },
      });
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
      });
      await this.mail.queue(
        tx,
        email.normalized,
        'INVITE',
        `You are invited to ${tenant.name} as ${dto.role.toLowerCase()}.`,
        { token, invitationId: invite.id, expiresAt },
      );
      await this.events.record(
        tx,
        'INVITATION_CREATED',
        actor.sub,
        actor.sessionId,
        { invitationId: invite.id, tenantId },
      );
      return {
        status: 'invited' as const,
        id: invite.id,
        email: email.raw,
        role: dto.role,
      };
    }).then((r) => {
      if ('error' in r) throw authError('RATE_LIMITED', 429, r.retry);
      return r;
    });
  }
  async bulkCreate(
    tenantId: string,
    entries: { email: string; role: Role }[],
    actor: AnyAccessTokenPayload,
  ) {
    if (entries.length > 50) throw authError('VALIDATION_ERROR');
    const added: unknown[] = [],
      invited: unknown[] = [],
      failed: { email: string; reason: string }[] = [];
    for (const entry of entries) {
      try {
        const r = await this.create(tenantId, entry, actor);
        (r.status === 'added' ? added : invited).push(r);
      } catch {
        failed.push({
          email: entry.email,
          reason: 'Could not add or invite this member',
        });
      }
    }
    return { added, invited, failed };
  }
  async inspect(token: string, source: string) {
    await this.rates.gate('invite-inspect', source);
    const invite = await this.db.memberInvitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: { tenant: true },
    });
    if (
      !invite ||
      invite.status !== 'PENDING' ||
      invite.expiresAt <= this.clock.now() ||
      invite.tenant.status !== 'ACTIVE'
    )
      throw authError('INVITATION_INVALID');
    return {
      tenantName: invite.tenant.name,
      role: invite.role,
      maskedEmail: maskEmail(invite.emailNormalized),
      expiresAt: invite.expiresAt,
    };
  }
  async accept(
    dto: { token: string; name?: string; password?: string },
    ctx: BrowserContext,
    actor?: AnyAccessTokenPayload,
  ) {
    this.policy.enabled();
    await this.rates.gate('invite-accept', ctx.source);
    const hash = dto.password ? await this.passwords.hash(dto.password) : null;
    const challenge = await serial(this.db, async (tx) => {
      const invite = await tx.memberInvitation.findUnique({
        where: { tokenHash: sha256(dto.token) },
        include: { tenant: true },
      });
      if (
        !invite ||
        invite.status !== 'PENDING' ||
        invite.expiresAt <= this.clock.now() ||
        invite.tenant.status !== 'ACTIVE'
      )
        throw authError('INVITATION_INVALID');
      this.policy.enabled(invite.emailNormalized);
      await mailboxLock(tx, invite.emailNormalized);
      const user = await tx.user.findUnique({
        where: { emailNormalized: invite.emailNormalized },
      });
      if (user) {
        if (!actor || actor.sub !== user.id)
          throw authError('INVITATION_SIGN_IN_REQUIRED', 409);
        const s = await this.sessions.live(tx, actor);
        if (dto.password || dto.name) throw authError('VALIDATION_ERROR');
        return this.otp.create(
          tx,
          {
            purpose: 'LOGIN_VERIFY',
            principalKind: 'USER',
            userId: user.id,
            userTokenVersion: user.tokenVersion,
            emailNormalized: user.emailNormalized,
            firstFactor: s.authMethods.includes('PASSWORD')
              ? 'PASSWORD'
              : 'GOOGLE',
            firstFactorAt: this.clock.now(),
            sessionId: s.id,
            invitationId: invite.id,
            invitationTokenHash: invite.tokenHash,
            loginReasons: ['INVITATION'],
          },
          ctx,
        );
      }
      if (!hash || !dto.name) throw authError('VALIDATION_ERROR');
      const pending = await tx.pendingRegistration.create({
        data: {
          email: invite.email,
          emailNormalized: invite.emailNormalized,
          name: dto.name,
          provider: 'PASSWORD',
          passwordHash: hash,
          contextHash: ctx.contextHash,
          invitationId: invite.id,
          expiresAt: plusMs(this.clock.now(), 600000),
        },
      });
      return this.otp.create(
        tx,
        {
          purpose: 'SIGNUP_VERIFY',
          principalKind: 'REGISTRATION',
          pendingRegistrationId: pending.id,
          emailNormalized: invite.emailNormalized,
          firstFactor: 'PASSWORD',
          firstFactorAt: this.clock.now(),
          invitationId: invite.id,
          invitationTokenHash: invite.tokenHash,
          expiresAt: pending.expiresAt,
        },
        ctx,
      );
    });
    return this.otp.present(challenge, ctx, false, actor);
  }
  async resend(tenantId: string, id: string, actor: AnyAccessTokenPayload) {
    this.policy.enabled();
    const outcome = await serial(this.db, async (tx) => {
      await this.admin(tx, tenantId, actor);
      const invite = await tx.memberInvitation.findUnique({ where: { id } }),
        now = this.clock.now();
      if (
        !invite ||
        invite.tenantId !== tenantId ||
        invite.status !== 'PENDING' ||
        invite.expiresAt <= now
      )
        throw authError('INVITATION_INVALID');
      const cooldown = invite.lastSentAt
        ? Math.ceil(
            (60000 - now.getTime() + invite.lastSentAt.getTime()) / 1000,
          )
        : 0;
      if (cooldown > 0) return { retry: cooldown };
      const retry = await this.rates.bucket(
        tx,
        'invite-resend',
        this.rates.hash('invite', id),
        3,
        DAY,
      );
      if (retry) return { retry };
      const token = this.random.token();
      await this.mail.cancelInvite(tx, id);
      await tx.memberInvitation.update({
        where: { id },
        data: { tokenHash: sha256(token), lastSentAt: now },
      });
      await tx.authChallenge.updateMany({
        where: {
          invitationId: id,
          state: { in: ['PENDING_SEND', 'READY', 'FAILED'] },
        },
        data: { state: 'CANCELLED' },
      });
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
      });
      await this.mail.queue(
        tx,
        invite.emailNormalized,
        'INVITE',
        `You are invited to ${tenant.name} as ${invite.role.toLowerCase()}.`,
        { token, invitationId: id, expiresAt: invite.expiresAt },
      );
      await this.events.record(
        tx,
        'INVITATION_RESENT',
        actor.sub,
        actor.sessionId,
        { invitationId: id },
      );
      return { ok: true };
    });
    if ('retry' in outcome) throw authError('RATE_LIMITED', 429, outcome.retry);
    return { status: 'queued' };
  }
  async revoke(tenantId: string, id: string, actor: AnyAccessTokenPayload) {
    return serial(this.db, async (tx) => {
      await this.admin(tx, tenantId, actor);
      const invite = await tx.memberInvitation.findUnique({ where: { id } });
      if (!invite || invite.tenantId !== tenantId)
        throw authError('NOT_FOUND', 404);
      await tx.memberInvitation.update({
        where: { id },
        data: { status: 'REVOKED' },
      });
      await this.mail.cancelInvite(tx, id);
      await tx.authChallenge.updateMany({
        where: {
          invitationId: id,
          state: { in: ['READY', 'FAILED', 'PENDING_SEND'] },
        },
        data: { state: 'CANCELLED' },
      });
      await this.events.record(
        tx,
        'INVITATION_REVOKED',
        actor.sub,
        actor.sessionId,
        { invitationId: id },
      );
      return { id };
    });
  }
}
