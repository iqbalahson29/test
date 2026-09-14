import { Injectable } from '@nestjs/common';
import { GrantAction } from '@prisma/client';
import type { AuthAction } from '@quiz-platform/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthClock,
  AuthRandom,
  Tx,
  actionHash,
  authError,
  mailboxLock,
  plusMs,
  serial,
  sha256,
} from './security/primitives';
import { BrowserContext } from './security/cookies';
import { AnyAccessTokenPayload } from './token.types';
import { SessionService } from './session.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { IdentifierService } from './identifier.service';
import { AuthPolicyService } from './auth-policy.service';
import { RateLimitsService } from './security/rate-limits.service';
import { SecurityEventsService } from './security/security-events.service';
import { MailerService } from '../mailer/mailer.service';
import { AuthCompletionService } from './auth-completion.service';
export interface ActionTarget {
  userId?: string;
  email?: string;
  pendingLinkId?: string;
}
export interface AdminUserUpdate {
  name?: string;
  email?: string;
  newPassword?: string;
  emailChangeGrantToken?: string;
  passwordSetGrantToken?: string;
  reason?: string;
}
@Injectable()
export class CredentialsService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: AuthClock,
    private readonly random: AuthRandom,
    private readonly sessions: SessionService,
    private readonly otp: OtpService,
    private readonly passwords: PasswordService,
    private readonly identifiers: IdentifierService,
    private readonly policy: AuthPolicyService,
    private readonly rates: RateLimitsService,
    private readonly events: SecurityEventsService,
    private readonly mail: MailerService,
    private readonly completion: AuthCompletionService,
  ) {}
  async target(
    tx: Tx,
    actor: AnyAccessTokenPayload,
    action: AuthAction,
    target: ActionTarget,
    ctx: BrowserContext,
  ) {
    const live = await this.sessions.live(tx, actor);
    let userId = actor.sub,
      candidate = '',
      sub = '';
    if (action.startsWith('ADMIN_')) {
      if (!live.user.isSuperAdmin || actor.type !== 'superadmin')
        throw authError('FORBIDDEN', 403);
      if (!target.userId) throw authError('VALIDATION_ERROR');
      userId = target.userId;
      if (!(await tx.user.findUnique({ where: { id: userId } })))
        throw authError('NOT_FOUND', 404);
    }
    if (
      [
        'EMAIL_CHANGE_START',
        'ADMIN_EMAIL_CHANGE',
        'ADMIN_SUPPRESSION_CLEAR',
      ].includes(action)
    ) {
      candidate = this.identifiers.normalize(target.email).normalized;
      if (action === 'ADMIN_SUPPRESSION_CLEAR') {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        if (user.emailNormalized !== candidate)
          throw authError('AUTH_CONTEXT_CHANGED', 409);
      }
    }
    if (action === 'GOOGLE_LINK') {
      this.policy.googleEnabled();
      const link = target.pendingLinkId
        ? await tx.pendingGoogleLink.findUnique({
            where: { id: target.pendingLinkId },
          })
        : null;
      if (
        !link ||
        link.userId !== actor.sub ||
        link.sessionId !== actor.sessionId ||
        link.tokenVersion !== actor.tokenVersion ||
        link.contextHash !== ctx.contextHash ||
        link.consumedAt ||
        link.expiresAt <= this.clock.now()
      )
        throw authError('CHALLENGE_INVALID');
      sub = link.googleSub;
    }
    if (
      (action === 'PASSWORD_CHANGE' && !live.user.passwordHash) ||
      (action === 'PASSWORD_SET' && live.user.passwordHash)
    )
      throw authError('ACTION_UNAVAILABLE', 409);
    return actionHash(action, actor.sub, userId, candidate, sub);
  }
  async stepUp(
    action: AuthAction,
    target: ActionTarget,
    actor: AnyAccessTokenPayload,
    ctx: BrowserContext,
  ) {
    this.policy.enabled();
    await this.rates.sessionGate('step-up', actor.sessionId, ctx.source);
    const c = await serial(this.db, async (tx) => {
      const s = await this.sessions.live(tx, actor),
        hash = await this.target(tx, actor, action, target, ctx);
      return this.otp.create(
        tx,
        {
          purpose: 'STEP_UP',
          principalKind: 'USER',
          userId: actor.sub,
          userTokenVersion: s.user.tokenVersion,
          emailNormalized: s.user.emailNormalized,
          sessionId: actor.sessionId,
          action,
          actionTargetHash: hash,
          pendingGoogleLinkId:
            action === 'GOOGLE_LINK' ? target.pendingLinkId : null,
        },
        ctx,
      );
    });
    return this.otp.present(c, ctx, false, actor).catch((e) => {
      throw e;
    });
  }
  verifyGrant(
    purpose: 'STEP_UP' | 'PASSWORD_RESET',
    challengeId: string,
    code: string,
    ctx: BrowserContext,
    actor?: AnyAccessTokenPayload,
  ) {
    return this.otp.verify(
      challengeId,
      code,
      [purpose],
      ctx,
      actor,
      async (tx, c) => {
        if (!c.userId || (purpose === 'STEP_UP' && (!c.action || !c.sessionId)))
          throw authError('CHALLENGE_INVALID');
        const token = this.random.token(),
          expiresAt = plusMs(this.clock.now(), 600000);
        await tx.authGrant.create({
          data: {
            tokenHash: sha256(token),
            sourceChallengeId: c.id,
            userId: c.userId,
            sessionId: purpose === 'STEP_UP' ? c.sessionId : null,
            contextHash: ctx.contextHash,
            action: purpose === 'PASSWORD_RESET' ? 'PASSWORD_RESET' : c.action!,
            actionTargetHash: c.actionTargetHash,
            tokenVersion: c.userTokenVersion!,
            expiresAt,
          },
        });
        return {
          status: 'verified' as const,
          grantToken: token,
          expiresAt: expiresAt.toISOString(),
        };
      },
    );
  }
  async grant(
    tx: Tx,
    token: string,
    action: GrantAction,
    ctx: BrowserContext,
    actor?: AnyAccessTokenPayload,
    hash?: string,
    consume = true,
  ) {
    const grant = await tx.authGrant.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true, sourceChallenge: true },
    });
    if (
      !grant ||
      grant.action !== action ||
      grant.contextHash !== ctx.contextHash ||
      grant.consumedAt ||
      grant.expiresAt <= this.clock.now() ||
      grant.user.isSuspended ||
      grant.tokenVersion !== grant.user.tokenVersion ||
      grant.sourceChallenge.state !== 'CONSUMED' ||
      grant.sourceChallenge.emailNormalized !== grant.user.emailNormalized
    )
      throw authError('GRANT_INVALID');
    if (action === 'PASSWORD_RESET') {
      if (
        grant.sessionId ||
        grant.sourceChallenge.purpose !== 'PASSWORD_RESET' ||
        !grant.user.passwordHash
      )
        throw authError('GRANT_INVALID');
    } else {
      if (
        !actor ||
        grant.userId !== actor.sub ||
        grant.sessionId !== actor.sessionId ||
        grant.sourceChallenge.purpose !== 'STEP_UP' ||
        grant.actionTargetHash !== hash
      )
        throw authError('GRANT_INVALID');
      await this.sessions.live(tx, actor);
    }
    if (consume) {
      const updated = await tx.authGrant.updateMany({
        where: {
          id: grant.id,
          consumedAt: null,
          expiresAt: { gt: this.clock.now() },
        },
        data: { consumedAt: this.clock.now() },
      });
      if (updated.count !== 1) throw authError('GRANT_INVALID');
    }
    return grant;
  }
  async requestReset(identifier: string, ctx: BrowserContext) {
    this.policy.enabled();
    await this.rates.publicGate('password-reset', ctx.source);
    const email = this.identifiers.normalize(identifier).normalized;
    const c = await serial(this.db, async (tx) => {
      const user = await tx.user.findUnique({
          where: { emailNormalized: email },
        }),
        recipient = await tx.mailRecipient.findUnique({
          where: { emailCanonical: email },
        });
      const eligible =
        user &&
        !user.isSuspended &&
        user.passwordHash &&
        recipient?.state !== 'SUPPRESSED' &&
        this.mail.allowed(email);
      return this.otp.create(
        tx,
        {
          purpose: 'PASSWORD_RESET',
          principalKind: eligible ? 'USER' : 'DECOY',
          userId: eligible ? user.id : null,
          userTokenVersion: eligible ? user.tokenVersion : null,
          emailNormalized: email,
        },
        ctx,
      );
    });
    return this.otp.present(c, ctx, true);
  }
  async reset(token: string, newPassword: string, ctx: BrowserContext) {
    this.policy.enabled();
    await this.rates.gate('reset-complete', ctx.source);
    const hash = await this.passwords.hash(newPassword);
    await serial(this.db, async (tx) => {
      const grant = await this.grant(tx, token, 'PASSWORD_RESET', ctx);
      const user = grant.user;
      await mailboxLock(tx, user.emailNormalized);
      await this.passwords.ensureFresh(
        newPassword,
        user.passwordHash,
        user.previousPasswordHashes,
      );
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hash,
          previousPasswordHashes: this.passwords.history(
            user.passwordHash,
            user.previousPasswordHashes,
          ),
          emailVerifiedAt: this.clock.now(),
          tokenVersion: { increment: 1 },
        },
      });
      await tx.authIdentity.upsert({
        where: { userId_provider: { userId: user.id, provider: 'PASSWORD' } },
        create: {
          userId: user.id,
          provider: 'PASSWORD',
          providerUserId: user.id,
        },
        update: {},
      });
      await this.sessions.invalidateUser(tx, user.id, 'password-reset');
      await this.events.record(tx, 'PASSWORD_RESET', user.id);
      await this.mail.queue(
        tx,
        user.emailNormalized,
        'SECURITY',
        'Your password was reset. All sessions and remembered devices were revoked.',
      );
    });
    return { status: 'ok' as const };
  }
  private async rotateCredential(
    tx: Tx,
    userId: string,
    sessionId: string,
    reason: string,
  ) {
    const user = await tx.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    await this.sessions.invalidateUser(tx, userId, reason, sessionId);
    const session = await tx.session.update({
      where: { id: sessionId },
      data: { tokenVersion: user.tokenVersion },
    });
    await this.events.record(
      tx,
      reason.toUpperCase().replaceAll('-', '_'),
      userId,
      sessionId,
    );
    return { ...(await this.sessions.issue(tx, session)), clearDevice: true };
  }
  async password(
    action: 'PASSWORD_CHANGE' | 'PASSWORD_SET',
    dto: { currentPassword?: string; newPassword: string; grantToken: string },
    actor: AnyAccessTokenPayload,
    ctx: BrowserContext,
  ) {
    this.policy.enabled();
    await this.rates.sessionGate(
      'credential-change',
      actor.sessionId,
      ctx.source,
    );
    const hash = await this.passwords.hash(dto.newPassword);
    return serial(this.db, async (tx) => {
      const s = await this.sessions.live(tx, actor),
        user = s.user;
      const target = await this.target(tx, actor, action, {}, ctx);
      await this.grant(tx, dto.grantToken, action, ctx, actor, target);
      if (
        action === 'PASSWORD_CHANGE' &&
        !(await this.passwords.verify(dto.currentPassword, user.passwordHash))
      )
        throw authError('INVALID_CREDENTIALS', 401);
      await this.passwords.ensureFresh(
        dto.newPassword,
        user.passwordHash,
        user.previousPasswordHashes,
      );
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hash,
          previousPasswordHashes: this.passwords.history(
            user.passwordHash,
            user.previousPasswordHashes,
          ),
        },
      });
      await tx.authIdentity.upsert({
        where: { userId_provider: { userId: user.id, provider: 'PASSWORD' } },
        create: {
          userId: user.id,
          provider: 'PASSWORD',
          providerUserId: user.id,
        },
        update: {},
      });
      const result = await this.rotateCredential(
        tx,
        user.id,
        s.id,
        'password-changed',
      );
      await this.mail.queue(
        tx,
        user.emailNormalized,
        'SECURITY',
        'Your password was changed. Other sessions and remembered devices were revoked.',
      );
      return result;
    });
  }
  async requestEmail(
    dto: { email: string; currentPassword?: string; grantToken: string },
    actor: AnyAccessTokenPayload,
    ctx: BrowserContext,
  ) {
    this.policy.enabled();
    await this.rates.sessionGate(
      'credential-change',
      actor.sessionId,
      ctx.source,
    );
    const email = this.identifiers.normalize(dto.email);
    this.policy.enabled(email.normalized);
    const c = await serial(this.db, async (tx) => {
      await mailboxLock(tx, email.normalized);
      const s = await this.sessions.live(tx, actor),
        user = s.user;
      const target = await this.target(
        tx,
        actor,
        'EMAIL_CHANGE_START',
        { email: dto.email },
        ctx,
      );
      await this.grant(
        tx,
        dto.grantToken,
        'EMAIL_CHANGE_START',
        ctx,
        actor,
        target,
      );
      if (
        user.passwordHash &&
        !(await this.passwords.verify(dto.currentPassword, user.passwordHash))
      )
        throw authError('INVALID_CREDENTIALS', 401);
      if (email.normalized === user.emailNormalized) {
        await tx.user.update({
          where: { id: user.id },
          data: { email: email.raw },
        });
        return null;
      }
      if (
        await tx.user.findUnique({
          where: { emailNormalized: email.normalized },
        })
      )
        throw authError('EMAIL_CHANGE_UNAVAILABLE', 409);
      const now = this.clock.now();
      await tx.pendingEmailChange.updateMany({
        where: { userId: user.id, completedAt: null, invalidatedAt: null },
        data: { invalidatedAt: now },
      });
      await tx.authChallenge.updateMany({
        where: {
          userId: user.id,
          purpose: 'EMAIL_CHANGE',
          state: { in: ['READY', 'PENDING_SEND', 'FAILED'] },
        },
        data: { state: 'CANCELLED' },
      });
      const pending = await tx.pendingEmailChange.create({
        data: {
          userId: user.id,
          sessionId: s.id,
          oldEmailNormalized: user.emailNormalized,
          newEmail: email.raw,
          newEmailNormalized: email.normalized,
          tokenVersion: user.tokenVersion,
          expiresAt: plusMs(now, 600000),
        },
      });
      return this.otp.create(
        tx,
        {
          purpose: 'EMAIL_CHANGE',
          principalKind: 'USER',
          userId: user.id,
          sessionId: s.id,
          userTokenVersion: user.tokenVersion,
          emailNormalized: email.normalized,
          pendingEmailChangeId: pending.id,
          expiresAt: pending.expiresAt,
        },
        ctx,
      );
    });
    if (!c) return { status: 'ok' as const };
    return this.otp.present(c, ctx, false, actor);
  }
  async verifyEmail(
    challengeId: string,
    code: string,
    actor: AnyAccessTokenPayload,
    ctx: BrowserContext,
  ) {
    try {
      return await this.otp.verify(
        challengeId,
        code,
        ['EMAIL_CHANGE'],
        ctx,
        actor,
        async (tx, c) => {
          const pending = c.pendingEmailChangeId
            ? await tx.pendingEmailChange.findUnique({
                where: { id: c.pendingEmailChangeId },
              })
            : null;
          if (
            !pending ||
            pending.completedAt ||
            pending.invalidatedAt ||
            pending.expiresAt <= this.clock.now() ||
            pending.userId !== actor.sub ||
            pending.sessionId !== actor.sessionId ||
            pending.tokenVersion !== actor.tokenVersion
          )
            throw authError('CHALLENGE_INVALID');
          await mailboxLock(tx, pending.newEmailNormalized);
          const user = await tx.user.findUniqueOrThrow({
            where: { id: actor.sub },
          });
          if (user.emailNormalized !== pending.oldEmailNormalized)
            throw authError('CHALLENGE_INVALID');
          if (
            await tx.user.findUnique({
              where: { emailNormalized: pending.newEmailNormalized },
            })
          )
            throw authError('EMAIL_CHANGE_UNAVAILABLE', 409);
          await tx.user.update({
            where: { id: user.id },
            data: {
              email: pending.newEmail,
              emailNormalized: pending.newEmailNormalized,
              emailVerifiedAt: this.clock.now(),
            },
          });
          await tx.pendingEmailChange.update({
            where: { id: pending.id },
            data: { completedAt: this.clock.now() },
          });
          const output = await this.rotateCredential(
            tx,
            user.id,
            actor.sessionId,
            'email-changed',
          );
          for (const address of [
            pending.oldEmailNormalized,
            pending.newEmailNormalized,
          ])
            await this.mail.queue(
              tx,
              address,
              'SECURITY',
              'Your account email address was changed. Other sessions and remembered devices were revoked.',
            );
          return output;
        },
      );
    } catch (e) {
      if (
        e &&
        typeof e === 'object' &&
        'getStatus' in e &&
        (e as { getStatus: () => number }).getStatus() === 409
      ) {
        await this.db.pendingEmailChange.updateMany({
          where: { userId: actor.sub, completedAt: null, invalidatedAt: null },
          data: { invalidatedAt: this.clock.now() },
        });
        await this.db.authChallenge.updateMany({
          where: { publicId: challengeId, userId: actor.sub },
          data: { state: 'CANCELLED' },
        });
      }
      throw e;
    }
  }
  async link(
    pendingLinkId: string,
    grantToken: string,
    actor: AnyAccessTokenPayload,
    ctx: BrowserContext,
  ) {
    this.policy.googleEnabled();
    await this.rates.sessionGate(
      'credential-change',
      actor.sessionId,
      ctx.source,
    );
    return serial(this.db, async (tx) => {
      const hash = await this.target(
        tx,
        actor,
        'GOOGLE_LINK',
        { pendingLinkId },
        ctx,
      );
      await this.grant(tx, grantToken, 'GOOGLE_LINK', ctx, actor, hash);
      const pending = await tx.pendingGoogleLink.findUniqueOrThrow({
          where: { id: pendingLinkId },
        }),
        user = await tx.user.findUniqueOrThrow({ where: { id: actor.sub } });
      await this.completion.link(
        tx,
        user,
        pending.googleSub,
        pending.providerEmail,
        pending.authoritative,
      );
      await tx.pendingGoogleLink.updateMany({
        where: { userId: actor.sub, consumedAt: null },
        data: { consumedAt: this.clock.now() },
      });
      await tx.authGrant.updateMany({
        where: {
          userId: actor.sub,
          action: { in: ['GOOGLE_LINK', 'GOOGLE_UNLINK'] },
          consumedAt: null,
        },
        data: { consumedAt: this.clock.now() },
      });
      return { status: 'ok' as const };
    });
  }
  async unlink(
    grantToken: string,
    actor: AnyAccessTokenPayload,
    ctx: BrowserContext,
  ) {
    this.policy.enabled();
    await this.rates.sessionGate(
      'credential-change',
      actor.sessionId,
      ctx.source,
    );
    return serial(this.db, async (tx) => {
      const s = await this.sessions.live(tx, actor);
      await this.grant(
        tx,
        grantToken,
        'GOOGLE_UNLINK',
        ctx,
        actor,
        actionHash('GOOGLE_UNLINK', actor.sub, actor.sub),
      );
      if (
        !s.user.passwordHash ||
        !(await tx.authIdentity.findUnique({
          where: {
            userId_provider: { userId: actor.sub, provider: 'PASSWORD' },
          },
        }))
      )
        throw authError('LAST_IDENTITY', 409);
      await tx.authIdentity.deleteMany({
        where: { userId: actor.sub, provider: 'GOOGLE' },
      });
      await this.mail.queue(
        tx,
        s.user.emailNormalized,
        'SECURITY',
        'Google sign-in was disconnected from your account.',
      );
      return this.rotateCredential(
        tx,
        actor.sub,
        actor.sessionId,
        'google-unlinked',
      );
    });
  }
  async adminUpdate(
    userId: string,
    dto: AdminUserUpdate,
    actor: AnyAccessTokenPayload,
    ctx: BrowserContext,
  ) {
    this.policy.enabled();
    await this.rates.sessionGate(
      'credential-change',
      actor.sessionId,
      ctx.source,
    );
    const email = dto.email ? this.identifiers.normalize(dto.email) : null,
      hash = dto.newPassword
        ? await this.passwords.hash(dto.newPassword)
        : undefined;
    return serial(this.db, async (tx) => {
      const actorSession = await this.sessions.live(tx, actor);
      if (actor.type !== 'superadmin' || !actorSession.user.isSuperAdmin)
        throw authError('FORBIDDEN', 403);
      if (email) await mailboxLock(tx, email.normalized);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw authError('NOT_FOUND', 404);
      const changeEmail = email && email.normalized !== user.emailNormalized;
      if (
        (changeEmail || hash) &&
        (!dto.reason ||
          dto.reason.trim().length < 10 ||
          dto.reason.length > 500)
      )
        throw authError('VALIDATION_ERROR');
      if (
        Boolean(dto.emailChangeGrantToken) !== Boolean(changeEmail) ||
        Boolean(dto.passwordSetGrantToken) !== Boolean(hash)
      )
        throw authError('GRANT_INVALID');
      if (changeEmail) {
        await this.grant(
          tx,
          dto.emailChangeGrantToken!,
          'ADMIN_EMAIL_CHANGE',
          ctx,
          actor,
          actionHash('ADMIN_EMAIL_CHANGE', actor.sub, userId, email.normalized),
        );
        if (!user.passwordHash && !hash) throw authError('LAST_IDENTITY', 409);
        if (
          await tx.user.findUnique({
            where: { emailNormalized: email.normalized },
          })
        )
          throw authError('EMAIL_CHANGE_UNAVAILABLE', 409);
      }
      if (hash) {
        await this.grant(
          tx,
          dto.passwordSetGrantToken!,
          'ADMIN_PASSWORD_SET',
          ctx,
          actor,
          actionHash('ADMIN_PASSWORD_SET', actor.sub, userId),
        );
        await this.passwords.ensureFresh(
          dto.newPassword!,
          user.passwordHash,
          user.previousPasswordHashes,
        );
      }
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          name: dto.name,
          ...(email ? { email: email.raw } : {}),
          ...(changeEmail
            ? { emailNormalized: email.normalized, emailVerifiedAt: null }
            : {}),
          ...(hash
            ? {
                passwordHash: hash,
                previousPasswordHashes: this.passwords.history(
                  user.passwordHash,
                  user.previousPasswordHashes,
                ),
              }
            : {}),
          ...(changeEmail || hash ? { tokenVersion: { increment: 1 } } : {}),
        },
      });
      if (changeEmail)
        await tx.authIdentity.deleteMany({
          where: { userId, provider: 'GOOGLE' },
        });
      if (hash)
        await tx.authIdentity.upsert({
          where: { userId_provider: { userId, provider: 'PASSWORD' } },
          create: { userId, provider: 'PASSWORD', providerUserId: userId },
          update: {},
        });
      if (changeEmail || hash) {
        await this.sessions.invalidateUser(
          tx,
          userId,
          'administrator-credential-change',
        );
        await this.events.record(
          tx,
          'ADMIN_CREDENTIAL_CHANGE',
          actor.sub,
          actor.sessionId,
          {
            targetUserId: userId,
            reason: dto.reason!,
            action:
              changeEmail && hash
                ? 'EMAIL_AND_PASSWORD'
                : changeEmail
                  ? 'EMAIL'
                  : 'PASSWORD',
          },
        );
        for (const address of new Set([
          user.emailNormalized,
          updated.emailNormalized,
        ]))
          await this.mail.queue(
            tx,
            address,
            'SECURITY',
            'An administrator changed your account credentials. All sessions and remembered devices were revoked.',
          );
      }
      return { id: updated.id, name: updated.name, email: updated.email };
    });
  }
  async clearSuppression(
    userId: string,
    grantToken: string,
    reason: string,
    actor: AnyAccessTokenPayload,
    ctx: BrowserContext,
  ) {
    this.policy.enabled();
    await this.rates.sessionGate(
      'credential-change',
      actor.sessionId,
      ctx.source,
    );
    const address = await serial(this.db, async (tx) => {
      const s = await this.sessions.live(tx, actor);
      if (actor.type !== 'superadmin' || !s.user.isSuperAdmin)
        throw authError('FORBIDDEN', 403);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw authError('NOT_FOUND', 404);
      await this.grant(
        tx,
        grantToken,
        'ADMIN_SUPPRESSION_CLEAR',
        ctx,
        actor,
        actionHash(
          'ADMIN_SUPPRESSION_CLEAR',
          actor.sub,
          userId,
          user.emailNormalized,
        ),
        false,
      );
      return user.emailNormalized;
    });
    if (!this.mail.driver.unblock) throw authError('AUTH_UNAVAILABLE', 503);
    await this.mail.driver.unblock(address).catch(() => {
      throw authError('SUPPRESSION_CLEAR_UNAVAILABLE', 503);
    });
    await serial(this.db, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.emailNormalized !== address)
        throw authError('AUTH_CONTEXT_CHANGED', 409);
      await this.grant(
        tx,
        grantToken,
        'ADMIN_SUPPRESSION_CLEAR',
        ctx,
        actor,
        actionHash('ADMIN_SUPPRESSION_CLEAR', actor.sub, userId, address),
      );
      await tx.mailRecipient.upsert({
        where: { emailCanonical: address },
        create: { emailCanonical: address, lastClearedAt: this.clock.now() },
        update: {
          state: 'OK',
          reason: null,
          suppressedAt: null,
          softFailureCount: 0,
          lastClearedAt: this.clock.now(),
        },
      });
      await this.events.record(
        tx,
        'SUPPRESSION_CLEARED',
        actor.sub,
        actor.sessionId,
        { targetUserId: userId, reason },
      );
    });
    return { status: 'ok' as const };
  }
}
