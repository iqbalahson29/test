import { Injectable } from '@nestjs/common';
import { AuthChallenge, User } from '@prisma/client';
import { isIP } from 'node:net';
import {
  AuthClock,
  AuthRandom,
  DAY,
  Tx,
  authError,
  mailboxLock,
  plusMs,
  sha256,
} from './security/primitives';
import { BrowserContext } from './security/cookies';
import { SessionService, SessionOutput, FactorFacts } from './session.service';
import { MailerService } from '../mailer/mailer.service';
import { SecurityEventsService } from './security/security-events.service';
@Injectable()
export class AuthCompletionService {
  constructor(
    private readonly sessions: SessionService,
    private readonly clock: AuthClock,
    private readonly random: AuthRandom,
    private readonly mail: MailerService,
    private readonly events: SecurityEventsService,
  ) {}
  async link(
    tx: Tx,
    user: User,
    sub: string,
    email: string,
    authoritative: boolean,
  ) {
    const existing = await tx.authIdentity.findUnique({
      where: {
        provider_providerUserId: { provider: 'GOOGLE', providerUserId: sub },
      },
    });
    const other = await tx.authIdentity.findUnique({
      where: { userId_provider: { userId: user.id, provider: 'GOOGLE' } },
    });
    if (
      (existing && existing.userId !== user.id) ||
      (other && other.providerUserId !== sub)
    )
      throw authError('ACCOUNT_LINK_CONFLICT', 409);
    if (!other) {
      await tx.authIdentity.create({
        data: {
          userId: user.id,
          provider: 'GOOGLE',
          providerUserId: sub,
          email,
          emailVerified: true,
          lastUsedAt: this.clock.now(),
        },
      });
      await this.events.record(tx, 'GOOGLE_LINKED', user.id, null, {
        provider: 'GOOGLE',
      });
      await this.mail.queue(
        tx,
        user.emailNormalized,
        'SECURITY',
        'Google sign-in was connected to your account.',
      );
    } else
      await tx.authIdentity.update({
        where: { id: other.id },
        data: { email, emailVerified: true, lastUsedAt: this.clock.now() },
      });
    if (
      authoritative &&
      email.toLowerCase() === user.emailNormalized &&
      !user.emailVerifiedAt
    )
      user = await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: this.clock.now() },
      });
    return user;
  }
  async finish(
    tx: Tx,
    c: AuthChallenge,
    ctx: BrowserContext,
    rememberDevice: boolean,
  ): Promise<
    SessionOutput | { result: { status: 'workspace-request-pending' } }
  > {
    const now = this.clock.now();
    await mailboxLock(tx, c.emailNormalized);
    if (c.principalKind === 'TENANT_REQUEST') {
      const r = await tx.tenantRequest.findUnique({
        where: { id: c.tenantRequestId! },
      });
      if (
        !r ||
        r.status !== 'PENDING' ||
        r.expiresAt <= now ||
        !r.passwordHash ||
        (r.contextHash !== ctx.contextHash && c.purpose === 'TENANT_REQUEST')
      )
        throw authError('CHALLENGE_INVALID');
      if (c.purpose === 'TENANT_REQUEST') {
        const [user, request, tenant, slugRequest] = await Promise.all([
          tx.user.findUnique({ where: { emailNormalized: r.emailNormalized } }),
          tx.tenantRequest.findFirst({
            where: {
              emailNormalized: r.emailNormalized,
              emailVerifiedAt: { not: null },
              status: 'PENDING',
              expiresAt: { gt: now },
              id: { not: r.id },
            },
          }),
          tx.tenant.findUnique({ where: { slug: r.slug } }),
          tx.tenantRequest.findFirst({
            where: {
              slug: r.slug,
              status: 'PENDING',
              emailVerifiedAt: { not: null },
              expiresAt: { gt: now },
              id: { not: r.id },
            },
          }),
        ]);
        if (user || request) throw authError('CHALLENGE_INVALID');
        if (tenant || slugRequest)
          throw authError('WORKSPACE_NAME_UNAVAILABLE', 409);
        await tx.tenantRequest.update({
          where: { id: r.id },
          data: { emailVerifiedAt: now, expiresAt: plusMs(now, 30 * DAY) },
        });
        const admins = await tx.user.findMany({
          where: { isSuperAdmin: true, isSuspended: false },
          select: { id: true },
        });
        for (const admin of admins)
          await tx.notification.create({
            data: {
              recipientUserId: admin.id,
              type: 'WORKSPACE_REQUEST_SUBMITTED',
              title: 'New verified workspace request',
              body: r.workspaceName,
              link: '/superadmin',
            },
          });
        await this.events.record(tx, 'TENANT_REQUEST_VERIFIED', null, null, {
          tenantRequestId: r.id,
        });
      } else if (!r.emailVerifiedAt) throw authError('CHALLENGE_INVALID');
      return { result: { status: 'workspace-request-pending' } };
    }
    let user: User;
    if (c.principalKind === 'REGISTRATION') {
      const pending = await tx.pendingRegistration.findUnique({
        where: { id: c.pendingRegistrationId! },
      });
      if (
        !pending ||
        pending.completedAt ||
        pending.expiresAt <= now ||
        pending.contextHash !== ctx.contextHash ||
        pending.emailNormalized !== c.emailNormalized
      )
        throw authError('CHALLENGE_INVALID');
      if (
        await tx.user.findUnique({
          where: { emailNormalized: c.emailNormalized },
        })
      )
        throw authError('CHALLENGE_INVALID');
      if (
        pending.provider === 'GOOGLE' &&
        (await tx.authIdentity.findUnique({
          where: {
            provider_providerUserId: {
              provider: 'GOOGLE',
              providerUserId: pending.googleSub!,
            },
          },
        }))
      )
        throw authError('ACCOUNT_LINK_CONFLICT', 409);
      await this.validateInvite(tx, c, c.emailNormalized);
      user = await tx.user.create({
        data: {
          email: pending.email,
          emailNormalized: pending.emailNormalized,
          name: pending.name,
          passwordHash: pending.passwordHash,
          emailVerifiedAt: now,
        },
      });
      await tx.authIdentity.create({
        data: {
          userId: user.id,
          provider: pending.provider,
          providerUserId:
            pending.provider === 'PASSWORD' ? user.id : pending.googleSub!,
          email: pending.provider === 'GOOGLE' ? pending.googleEmail : null,
          emailVerified: true,
          lastUsedAt: now,
        },
      });
      await tx.pendingRegistration.update({
        where: { id: pending.id },
        data: {
          completedAt: now,
          passwordHash: null,
          googleSub: null,
          googleEmail: null,
          googleAuthoritative: null,
        },
      });
      await this.events.record(tx, 'REGISTRATION_COMPLETED', user.id);
      const admins = await tx.user.findMany({
        where: { isSuperAdmin: true, isSuspended: false },
        select: { id: true },
      });
      for (const admin of admins)
        await tx.notification.create({
          data: {
            recipientUserId: admin.id,
            type: 'USER_REGISTERED',
            title: 'New account registered',
            body: user.name,
            link: '/superadmin/users',
          },
        });
    } else {
      user = await tx.user.findUniqueOrThrow({ where: { id: c.userId! } });
      if (
        user.isSuspended ||
        user.tokenVersion !== c.userTokenVersion ||
        user.emailNormalized !== c.emailNormalized
      )
        throw authError('CHALLENGE_INVALID');
      await this.validateInvite(tx, c, user.emailNormalized);
      if (c.googleSub)
        user = await this.link(
          tx,
          user,
          c.googleSub,
          c.googleEmail!,
          !!c.googleAuthoritative,
        );
      user = await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: now },
      });
    }
    if (c.invitationId) {
      const invite = await tx.memberInvitation.findUniqueOrThrow({
        where: { id: c.invitationId },
      });
      await tx.membership.upsert({
        where: {
          userId_tenantId: { userId: user.id, tenantId: invite.tenantId },
        },
        create: {
          userId: user.id,
          tenantId: invite.tenantId,
          role: invite.role,
        },
        update: {},
      });
      await tx.memberInvitation.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED', acceptedAt: now },
      });
      await this.mail.cancelInvite(tx, invite.id);
      await this.events.record(tx, 'INVITATION_ACCEPTED', user.id, null, {
        invitationId: invite.id,
      });
    }
    if (
      !c.firstFactor ||
      !c.firstFactorAt ||
      c.firstFactorAt <= plusMs(now, -600000)
    )
      throw authError('CHALLENGE_INVALID');
    return this.login(
      tx,
      user,
      ctx,
      {
        firstFactor: c.firstFactor,
        firstFactorAt: c.firstFactorAt,
        otpVerifiedAt: now,
      },
      rememberDevice,
    );
  }
  private async validateInvite(tx: Tx, c: AuthChallenge, email: string) {
    if (!c.invitationId) return;
    const invite = await tx.memberInvitation.findUnique({
      where: { id: c.invitationId },
      include: { tenant: true },
    });
    if (
      !invite ||
      invite.status !== 'PENDING' ||
      invite.expiresAt <= this.clock.now() ||
      invite.emailNormalized !== email ||
      invite.tokenHash !== c.invitationTokenHash ||
      invite.tenant.status !== 'ACTIVE'
    )
      throw authError('CHALLENGE_INVALID');
  }
  async login(
    tx: Tx,
    user: User,
    ctx: BrowserContext,
    facts: FactorFacts,
    rememberDevice = false,
  ): Promise<SessionOutput> {
    const output = await this.sessions.create(tx, user, ctx, facts);
    if (user.isSuperAdmin) return output;
    const now = this.clock.now();
    const device = ctx.deviceToken
      ? await tx.trustedDevice.findUnique({
          where: { tokenHash: sha256(ctx.deviceToken) },
        })
      : null;
    const eligible =
      device &&
      device.userId === user.id &&
      !device.revokedAt &&
      device.expiresAt > now &&
      device.absoluteExpiresAt > now;
    if (eligible) {
      const expiresAt = new Date(
        Math.min(now.getTime() + 30 * DAY, device.absoluteExpiresAt.getTime()),
      );
      await tx.trustedDevice.update({
        where: { id: device.id },
        data: {
          expiresAt,
          lastUsedAt: now,
          lastIp: isIP(ctx.source) ? ctx.source : null,
        },
      });
      return {
        ...output,
        deviceToken: ctx.deviceToken,
        deviceExpiresAt: expiresAt,
      };
    }
    if (facts.otpVerifiedAt && rememberDevice) {
      const token = this.random.token(),
        expiresAt = plusMs(now, 30 * DAY);
      const devices = await tx.trustedDevice.findMany({
        where: {
          userId: user.id,
          revokedAt: null,
          expiresAt: { gt: now },
          absoluteExpiresAt: { gt: now },
        },
        orderBy: [{ lastUsedAt: 'desc' }, { id: 'desc' }],
      });
      if (devices.length >= 10)
        await tx.trustedDevice.updateMany({
          where: { id: { in: devices.slice(9).map((d) => d.id) } },
          data: { revokedAt: now },
        });
      await tx.trustedDevice.create({
        data: {
          userId: user.id,
          tokenHash: sha256(token),
          label: this.sessions.label(ctx.userAgent),
          lastIp: isIP(ctx.source) ? ctx.source : null,
          lastUsedAt: now,
          expiresAt,
          absoluteExpiresAt: plusMs(now, 90 * DAY),
        },
      });
      await this.events.record(tx, 'DEVICE_TRUSTED', user.id);
      return { ...output, deviceToken: token, deviceExpiresAt: expiresAt };
    }
    return output;
  }
}
