import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdentifierService } from './identifier.service';
import { PasswordService } from './password.service';
import {
  AuthClock,
  authError,
  mailboxLock,
  plusMs,
  serial,
} from './security/primitives';
import { RateLimitsService } from './security/rate-limits.service';
import { AuthPolicyService } from './auth-policy.service';
import { OtpService } from './otp.service';
import { AuthCompletionService } from './auth-completion.service';
import { BrowserContext } from './security/cookies';
import { SessionService } from './session.service';
import { GoogleService } from './google.service';
import { MailerService } from '../mailer/mailer.service';
import { AnyAccessTokenPayload } from './token.types';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SecurityEventsService } from './security/security-events.service';
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: IdentifierService,
    private readonly passwords: PasswordService,
    private readonly rates: RateLimitsService,
    private readonly clock: AuthClock,
    private readonly policy: AuthPolicyService,
    private readonly otp: OtpService,
    private readonly completion: AuthCompletionService,
    private readonly sessions: SessionService,
    private readonly googleService: GoogleService,
    private readonly mail: MailerService,
    private readonly events: SecurityEventsService,
  ) {}
  async login(identifier: string, password: string, ctx: BrowserContext) {
    this.policy.enabled();
    await this.rates.publicGate('login', ctx.source);
    let email: string;
    try {
      email = this.identifiers.normalize(identifier).normalized;
    } catch {
      await this.passwords.verify(password, null);
      throw authError('INVALID_CREDENTIALS', 401);
    }
    await this.rates.loginGate(email, ctx.source);
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: email },
    });
    const request = !user
      ? await this.prisma.tenantRequest.findFirst({
          where: {
            emailNormalized: email,
            emailVerifiedAt: { not: null },
            status: 'PENDING',
            expiresAt: { gt: this.clock.now() },
          },
        })
      : null;
    if (
      !(await this.passwords.verify(
        password,
        user?.passwordHash ?? request?.passwordHash,
      )) ||
      user?.isSuspended
    ) {
      await this.rates.badPassword(email, ctx.source, user?.id);
      throw authError('INVALID_CREDENTIALS', 401);
    }
    this.policy.enabled(email);
    const outcome = await serial(this.prisma, async (tx) => {
      if (!user) {
        const r = await tx.tenantRequest.findUnique({
          where: { id: request!.id },
        });
        if (
          !r ||
          r.passwordHash !== request!.passwordHash ||
          r.expiresAt <= this.clock.now() ||
          r.status !== 'PENDING'
        )
          throw authError('INVALID_CREDENTIALS', 401);
        return {
          challenge: await this.otp.create(
            tx,
            {
              purpose: 'LOGIN_VERIFY',
              principalKind: 'TENANT_REQUEST',
              tenantRequestId: r.id,
              emailNormalized: email,
              firstFactor: 'PASSWORD',
              firstFactorAt: this.clock.now(),
            },
            ctx,
          ),
        };
      }
      const live = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (
        live.passwordHash !== user.passwordHash ||
        live.tokenVersion !== user.tokenVersion ||
        live.isSuspended
      )
        throw authError('INVALID_CREDENTIALS', 401);
      const reasons = await this.policy.reasons(tx, live, ctx.deviceToken);
      if (reasons.length)
        return {
          challenge: await this.otp.create(
            tx,
            {
              purpose: 'LOGIN_VERIFY',
              principalKind: 'USER',
              userId: live.id,
              userTokenVersion: live.tokenVersion,
              emailNormalized: live.emailNormalized,
              firstFactor: 'PASSWORD',
              firstFactorAt: this.clock.now(),
              loginReasons: reasons,
            },
            ctx,
          ),
        };
      return {
        output: await this.completion.login(tx, live, ctx, {
          firstFactor: 'PASSWORD',
          firstFactorAt: this.clock.now(),
        }),
      };
    });
    return 'challenge' in outcome
      ? {
          result: await this.otp.present(outcome.challenge!, ctx),
          rememberDeviceAllowed:
            !outcome.challenge!.loginReasons.includes('SUPERADMIN') &&
            outcome.challenge!.principalKind !== 'TENANT_REQUEST',
        }
      : outcome.output;
  }
  async register(
    dto: { email: string; name: string; password: string },
    ctx: BrowserContext,
  ) {
    this.policy.enabled();
    await this.rates.publicGate('register', ctx.source);
    const email = this.identifiers.normalize(dto.email),
      hash = await this.passwords.hash(dto.password);
    const c = await serial(this.prisma, async (tx) => {
      await mailboxLock(tx, email.normalized);
      const user = await tx.user.findUnique({
        where: { emailNormalized: email.normalized },
      });
      if (user || !this.mail.allowed(email.normalized)) {
        if (user?.emailVerifiedAt) {
          const key = `duplicate:${this.rates.hash('identifier', email.normalized)}`;
          const recent = await tx.mailOutbox.findFirst({
            where: {
              idempotencyKey: { startsWith: key + ':' },
              createdAt: { gt: plusMs(this.clock.now(), -86400000) },
            },
          });
          if (!recent)
            await this.mail.queue(
              tx,
              user.emailNormalized,
              'SECURITY',
              'Someone requested a new account using your email. Your existing credentials were not changed.',
              { dedupeKey: `${key}:${this.clock.now().toISOString()}` },
            );
        }
        return this.otp.create(
          tx,
          {
            purpose: 'SIGNUP_VERIFY',
            principalKind: 'DECOY',
            emailNormalized: email.normalized,
          },
          ctx,
        );
      }
      const pending = await tx.pendingRegistration.create({
        data: {
          email: email.raw,
          emailNormalized: email.normalized,
          name: dto.name.trim(),
          provider: 'PASSWORD',
          passwordHash: hash,
          contextHash: ctx.contextHash,
          expiresAt: plusMs(this.clock.now(), 600000),
        },
      });
      return this.otp.create(
        tx,
        {
          purpose: 'SIGNUP_VERIFY',
          principalKind: 'REGISTRATION',
          pendingRegistrationId: pending.id,
          emailNormalized: email.normalized,
          firstFactor: 'PASSWORD',
          firstFactorAt: this.clock.now(),
          expiresAt: pending.expiresAt,
        },
        ctx,
      );
    });
    return this.otp.present(c, ctx, true);
  }
  verify(
    challengeId: string,
    code: string,
    rememberDevice: boolean,
    ctx: BrowserContext,
    actor?: AnyAccessTokenPayload,
  ) {
    return this.otp.verify(
      challengeId,
      code,
      ['SIGNUP_VERIFY', 'LOGIN_VERIFY'],
      ctx,
      actor,
      (tx, c) => this.completion.finish(tx, c, ctx, rememberDevice),
    );
  }
  async google(credential: string, ctx: BrowserContext) {
    await this.rates.publicGate('google', ctx.source);
    const facts = await this.googleService.verify(credential);
    this.policy.enabled(facts.canonical);
    const outcome = await serial(this.prisma, async (tx) => {
      await mailboxLock(tx, facts.canonical);
      await this.googleService.consumeNonce(tx, facts, 'LOGIN', ctx);
      const identity = await tx.authIdentity.findUnique({
        where: {
          provider_providerUserId: {
            provider: 'GOOGLE',
            providerUserId: facts.sub,
          },
        },
        include: { user: true },
      });
      let user =
        identity?.user ??
        (await tx.user.findUnique({
          where: { emailNormalized: facts.canonical },
        }));
      if (!user) {
        const pending = await tx.pendingRegistration.create({
          data: {
            email: facts.email,
            emailNormalized: facts.canonical,
            name: facts.name,
            provider: 'GOOGLE',
            googleSub: facts.sub,
            googleEmail: facts.email,
            googleAuthoritative: facts.authoritative,
            contextHash: ctx.contextHash,
            expiresAt: plusMs(this.clock.now(), 600000),
          },
        });
        return {
          challenge: await this.otp.create(
            tx,
            {
              purpose: 'SIGNUP_VERIFY',
              principalKind: 'REGISTRATION',
              pendingRegistrationId: pending.id,
              emailNormalized: facts.canonical,
              firstFactor: 'GOOGLE',
              firstFactorAt: this.clock.now(),
              expiresAt: pending.expiresAt,
            },
            ctx,
          ),
        };
      }
      if (user.isSuspended) throw authError('INVALID_CREDENTIALS', 401);
      const other = await tx.authIdentity.findUnique({
        where: { userId_provider: { userId: user.id, provider: 'GOOGLE' } },
      });
      if (other && other.providerUserId !== facts.sub)
        throw authError('ACCOUNT_LINK_CONFLICT', 409);
      const reasons = await this.policy.reasons(
        tx,
        user,
        ctx.deviceToken,
        !facts.authoritative || user.emailNormalized !== facts.canonical,
      );
      if (reasons.length)
        return {
          challenge: await this.otp.create(
            tx,
            {
              purpose: 'LOGIN_VERIFY',
              principalKind: 'USER',
              userId: user.id,
              userTokenVersion: user.tokenVersion,
              emailNormalized: user.emailNormalized,
              firstFactor: 'GOOGLE',
              firstFactorAt: this.clock.now(),
              googleSub: facts.sub,
              googleEmail: facts.email,
              googleAuthoritative: facts.authoritative,
              loginReasons: reasons,
            },
            ctx,
          ),
        };
      user = await this.completion.link(
        tx,
        user,
        facts.sub,
        facts.email,
        facts.authoritative,
      );
      return {
        output: await this.completion.login(tx, user, ctx, {
          firstFactor: 'GOOGLE',
          firstFactorAt: this.clock.now(),
        }),
      };
    });
    return 'challenge' in outcome
      ? {
          result: await this.otp.present(outcome.challenge!, ctx),
          rememberDeviceAllowed:
            !outcome.challenge!.loginReasons.includes('SUPERADMIN') &&
            outcome.challenge!.principalKind !== 'TENANT_REQUEST',
        }
      : outcome.output;
  }
  async requestLink(
    credential: string,
    ctx: BrowserContext,
    actor: AnyAccessTokenPayload,
  ) {
    await this.rates.sessionGate('google-link', actor.sessionId, ctx.source);
    const facts = await this.googleService.verify(credential);
    return serial(this.prisma, async (tx) => {
      const s = await this.sessions.live(tx, actor);
      await this.googleService.consumeNonce(tx, facts, 'LINK', ctx, actor);
      const existing = await tx.authIdentity.findUnique({
        where: {
          provider_providerUserId: {
            provider: 'GOOGLE',
            providerUserId: facts.sub,
          },
        },
      });
      const linked = await tx.authIdentity.findUnique({
        where: { userId_provider: { userId: actor.sub, provider: 'GOOGLE' } },
      });
      if ((existing && existing.userId !== actor.sub) || linked)
        throw authError('ACCOUNT_LINK_CONFLICT', 409);
      const expiresAt = plusMs(this.clock.now(), 600000);
      const link = await tx.pendingGoogleLink.create({
        data: {
          userId: actor.sub,
          sessionId: actor.sessionId,
          contextHash: ctx.contextHash,
          googleSub: facts.sub,
          providerEmail: facts.email,
          authoritative: facts.authoritative,
          tokenVersion: s.user.tokenVersion,
          expiresAt,
        },
      });
      return { pendingLinkId: link.id, expiresAt: expiresAt.toISOString() };
    });
  }
  async getProfile(userId: string, membershipId?: string, sessionId?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    // "Member since" reflects when this workspace membership started, not
    // the account itself — falls back to the account's own createdAt for
    // callers with no membership (superadmin, 0-membership accounts).
    let memberSince = user.createdAt;
    let groups: { id: string; name: string }[] = [];
    if (membershipId) {
      const membership = await this.prisma.membership.findUnique({
        where: { id: membershipId },
      });
      if (membership) {
        memberSince = membership.createdAt;
      }
      const groupMemberships = await this.prisma.groupMember.findMany({
        where: { membershipId },
        include: { group: true },
      });
      groups = groupMemberships.map((gm) => ({
        id: gm.group.id,
        name: gm.group.name,
      }));
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
      avatarUrl: user.avatarUrl,
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: user.dateOfBirth,
      bio: user.bio,
      phone: user.phone,
      location: user.location,
      timezone: user.timezone,
      locale: user.locale,
      emailNotifications: user.emailNotifications,
      gradeLevel: user.gradeLevel,
      studentId: user.studentId,
      guardianName: user.guardianName,
      guardianContact: user.guardianContact,
      memberSince,
      groups,
      emailVerified: !!user.emailVerifiedAt,
      passwordPresent: !!user.passwordHash,
      connectedAccounts: await this.prisma.authIdentity.findMany({
        where: { userId },
        select: { provider: true, email: true, lastUsedAt: true },
      }),
      pendingEmailChange: await this.prisma.pendingEmailChange.findFirst({
        where: {
          userId,
          completedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: this.clock.now() },
        },
        select: { newEmail: true, expiresAt: true },
      }),
      currentSession: sessionId
        ? await this.prisma.session.findUnique({
            where: { id: sessionId },
            select: {
              id: true,
              context: true,
              createdAt: true,
              idleExpiresAt: true,
              absoluteExpiresAt: true,
            },
          })
        : null,
    };
  }

  async updateProfile(actor: AnyAccessTokenPayload, dto: UpdateProfileDto) {
    return serial(this.prisma, async (tx) => {
      await this.sessions.live(tx, actor);
      const updated = await tx.user.update({
        where: { id: actor.sub },
        data: {
          ...dto,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        },
      });
      return {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        avatarUrl: updated.avatarUrl,
      };
    });
  }
}
