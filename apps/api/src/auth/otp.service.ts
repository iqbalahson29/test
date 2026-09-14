import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { AuthChallenge, OtpPurpose, Prisma } from '@prisma/client';
import { maskEmail, OtpRequired } from '@quiz-platform/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { MailError } from '../mailer/mail-driver';
import {
  AuthClock,
  AuthRandom,
  Tx,
  authError,
  equalHash,
  hmac,
  isTransientAuthFailure,
  plusMs,
  serial,
} from './security/primitives';
import { BrowserContext } from './security/cookies';
import { RateLimitsService } from './security/rate-limits.service';
import { AuthPolicyService } from './auth-policy.service';
import { AnyAccessTokenPayload } from './token.types';
import { SessionService } from './session.service';
import { SecurityEventsService } from './security/security-events.service';
export type ChallengeInput = Omit<
  Prisma.AuthChallengeUncheckedCreateInput,
  'publicId' | 'contextHash' | 'expiresAt'
> & { expiresAt?: Date };
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private tasks = new Set<Promise<unknown>>();
  constructor(
    private readonly db: PrismaService,
    private readonly clock: AuthClock,
    private readonly random: AuthRandom,
    private readonly config: ConfigService,
    private readonly mail: MailerService,
    private readonly rates: RateLimitsService,
    private readonly policy: AuthPolicyService,
    private readonly sessions: SessionService,
    private readonly events: SecurityEventsService,
  ) {}
  digest(
    challenge: Pick<AuthChallenge, 'publicId' | 'purpose'>,
    generation: number,
    code: string,
  ) {
    return hmac(
      this.config.getOrThrow('OTP_PEPPER'),
      `otp:v1|${challenge.publicId}|${challenge.purpose}|${generation}|${code}`,
    );
  }
  envelope(c: AuthChallenge): OtpRequired {
    return {
      status: 'otp-required',
      challengeId: c.publicId,
      maskedEmail: maskEmail(c.emailNormalized),
      expiresAt: c.expiresAt.toISOString(),
      resendAfterSeconds: 60,
    };
  }
  async create(tx: Tx, data: ChallengeInput, ctx: BrowserContext) {
    return tx.authChallenge.create({
      data: {
        ...data,
        publicId: this.random.token(),
        contextHash: ctx.contextHash,
        expiresAt: new Date(
          Math.min(
            plusMs(this.clock.now(), 600000).getTime(),
            data.expiresAt?.getTime() ?? Infinity,
          ),
        ),
        createdAt: this.clock.now(),
      },
    });
  }
  publicFlow(c: AuthChallenge) {
    return ['SIGNUP_VERIFY', 'PASSWORD_RESET', 'TENANT_REQUEST'].includes(
      c.purpose,
    );
  }
  supervise(run: () => Promise<unknown>) {
    const task = new Promise<void>((resolve) => setImmediate(resolve))
      .then(run)
      .catch(() =>
        this.logger.warn('Supervised authentication mail task failed'),
      )
      .finally(() => this.tasks.delete(task));
    this.tasks.add(task);
  }
  async drain() {
    await Promise.allSettled([...this.tasks]);
  }
  async present(
    c: AuthChallenge,
    ctx: BrowserContext,
    publicResponse = false,
    actor?: AnyAccessTokenPayload,
  ): Promise<OtpRequired> {
    if (publicResponse) {
      this.supervise(() => this.send(c.publicId, ctx));
      return this.envelope(c);
    }
    await this.send(c.publicId, ctx, actor);
    return this.envelope(c);
  }
  async send(
    publicId: string,
    ctx: BrowserContext,
    actor?: AnyAccessTokenPayload,
    resend = false,
  ) {
    this.policy.enabled();
    const code = this.random.code(),
      dispatchId = randomUUID();
    const prepared = await serial(this.db, async (tx) => {
      const c = await tx.authChallenge.findUnique({ where: { publicId } }),
        now = this.clock.now();
      if (
        !c ||
        c.contextHash !== ctx.contextHash ||
        ['CONSUMED', 'EXPIRED', 'LOCKED', 'CANCELLED'].includes(c.state) ||
        c.expiresAt <= now ||
        (resend && c.expiresAt.getTime() - now.getTime() < 60000)
      )
        return { error: 'CHALLENGE_INVALID' } as const;
      if (c.sessionId) {
        if (!actor || actor.sessionId !== c.sessionId)
          return { error: 'CHALLENGE_INVALID' } as const;
        await this.sessions.live(tx, actor);
      }
      const publicFlow = this.publicFlow(c);
      if (c.principalKind === 'DECOY') {
        await tx.authChallenge.update({
          where: { id: c.id },
          data: { state: 'FAILED', currentGeneration: { increment: 1 } },
        });
        return { decoy: true, challenge: c };
      }
      const retry = await this.rates.reserveSend(
        tx,
        c.emailNormalized,
        ctx.source,
        c.id,
      );
      if (retry) return { retry, challenge: c, publicFlow };
      const generation = c.currentGeneration + 1;
      const reserved = await this.mail.reserve(
        tx,
        { recipient: c.emailNormalized, category: 'OTP', dispatchId },
        1,
      );
      await tx.authChallenge.update({
        where: { id: c.id },
        data: {
          state: reserved ? 'PENDING_SEND' : 'FAILED',
          currentGeneration: generation,
          updatedAt: now,
        },
      });
      await tx.emailOtp.create({
        data: {
          challengeId: c.id,
          generation,
          codeHash: this.digest(c, generation, code),
          pepperVersion: Number(this.config.get('OTP_PEPPER_VERSION') ?? 1),
          sentTo: c.emailNormalized,
          deliveryProvenance:
            this.mail.driver.name === 'BREVO'
              ? 'BREVO'
              : this.mail.driver.name === 'CONSOLE'
                ? 'CONSOLE'
                : 'TEST',
          dispatchId,
          expiresAt: c.expiresAt,
          submission: reserved ? 'PENDING' : 'FAILED',
        },
      });
      await this.events.record(
        tx,
        reserved ? 'OTP_ISSUED' : 'OTP_SEND_FAILED',
        c.userId,
        c.sessionId,
        { purpose: c.purpose },
      );
      return { reserved, generation, challenge: c, publicFlow };
    });
    if ('error' in prepared) throw authError(prepared.error!);
    if ('decoy' in prepared) return this.envelope(prepared.challenge);
    if ('retry' in prepared) {
      if (!prepared.publicFlow)
        throw authError('RATE_LIMITED', 429, prepared.retry);
      return this.envelope(prepared.challenge);
    }
    const c = prepared.challenge;
    if (!prepared.reserved) {
      if (!prepared.publicFlow)
        throw authError(
          'OTP_DELIVERY_UNAVAILABLE',
          503,
          undefined,
          this.envelope(c),
        );
      return this.envelope(c);
    }
    let providerMessageId: string | undefined;
    let failed: MailError | undefined;
    try {
      const message = this.mail.otpMessage(
        c.emailNormalized,
        c.purpose,
        code,
        dispatchId,
        c.expiresAt,
      );
      providerMessageId = (await this.mail.sendOtp(message, c.expiresAt))
        .providerMessageId;
    } catch (e) {
      failed = e instanceof MailError ? e : new MailError('ambiguous');
    }
    await serial(this.db, async (tx) => {
      const current = await tx.authChallenge.findUnique({
        where: { id: c.id },
      });
      if (!current) return;
      const confirmed =
        !!providerMessageId &&
        current.currentGeneration === prepared.generation &&
        current.state === 'PENDING_SEND' &&
        current.expiresAt > this.clock.now();
      await tx.emailOtp.updateMany({
        where: { dispatchId, submission: 'PENDING' },
        data: {
          submission: confirmed
            ? 'CONFIRMED'
            : failed && ['ambiguous', 'duplicate'].includes(failed.kind)
              ? 'UNKNOWN'
              : 'FAILED',
          providerMessageId,
          confirmedAt: confirmed ? this.clock.now() : null,
        },
      });
      await tx.authChallenge.updateMany({
        where: {
          id: c.id,
          currentGeneration: prepared.generation,
          state: 'PENDING_SEND',
        },
        data: { state: confirmed ? 'READY' : 'FAILED' },
      });
      if (!confirmed)
        await this.events.record(
          tx,
          'OTP_SEND_FAILED',
          c.userId,
          c.sessionId,
          { purpose: c.purpose, kind: failed?.kind ?? 'expired' },
          'failure',
        );
    });
    if (!providerMessageId && !prepared.publicFlow)
      throw authError(
        'OTP_DELIVERY_UNAVAILABLE',
        503,
        undefined,
        this.envelope(c),
      );
    return this.envelope(c);
  }
  async resend(
    publicId: string,
    ctx: BrowserContext,
    actor?: AnyAccessTokenPayload,
  ) {
    await this.rates.gate('otp-resend', ctx.source, 10);
    const c = await this.db.authChallenge.findUnique({ where: { publicId } });
    if (
      !c ||
      c.contextHash !== ctx.contextHash ||
      ['CONSUMED', 'EXPIRED', 'LOCKED', 'CANCELLED'].includes(c.state) ||
      c.expiresAt.getTime() - this.clock.now().getTime() < 60000
    )
      throw authError('CHALLENGE_INVALID');
    if (this.publicFlow(c)) {
      this.supervise(() => this.send(publicId, ctx, actor, true));
      return { envelope: this.envelope(c), public: true };
    }
    return {
      envelope: await this.send(publicId, ctx, actor, true),
      public: false,
    };
  }
  async verify<T>(
    publicId: string,
    code: string,
    purposes: OtpPurpose[],
    ctx: BrowserContext,
    actor: AnyAccessTokenPayload | undefined,
    complete: (tx: Tx, c: AuthChallenge) => Promise<T>,
  ): Promise<T> {
    await this.rates.gate('otp-verify', ctx.source, 30);
    this.policy.enabled();
    if (!/^[0-9]{6}$/.test(code)) throw authError('CHALLENGE_INVALID');
    const outcome = await serial(this.db, async (tx) => {
      const c = await tx.authChallenge.findUnique({ where: { publicId } }),
        now = this.clock.now();
      if (
        !c ||
        c.contextHash !== ctx.contextHash ||
        !purposes.includes(c.purpose)
      )
        return { error: 'CHALLENGE_INVALID' } as const;
      // Only a definitively invalid session may void the challenge. A transient fault is
      // rethrown so the caller gets a retryable response without spending a code attempt.
      if (c.sessionId) {
        if (!actor || actor.sessionId !== c.sessionId)
          return { error: 'CHALLENGE_INVALID' } as const;
        try {
          await this.sessions.live(tx, actor);
        } catch (e) {
          if (isTransientAuthFailure(e)) throw e;
          return { error: 'CHALLENGE_INVALID' } as const;
        }
      }
      if (c.expiresAt <= now) {
        await tx.authChallenge.updateMany({
          where: {
            id: c.id,
            state: { in: ['PENDING_SEND', 'READY', 'FAILED'] },
          },
          data: { state: 'EXPIRED' },
        });
        return { error: 'CHALLENGE_INVALID' } as const;
      }
      if (c.principalKind === 'DECOY') {
        equalHash(
          this.digest(c, c.currentGeneration, code),
          this.digest(c, c.currentGeneration, '000000'),
        );
        return { error: 'CHALLENGE_INVALID' } as const;
      }
      if (c.state !== 'READY' || c.attempts >= 5)
        return { error: 'CHALLENGE_INVALID' } as const;
      const otp = await tx.emailOtp.findUnique({
        where: {
          challengeId_generation: {
            challengeId: c.id,
            generation: c.currentGeneration,
          },
        },
      });
      if (
        !otp ||
        otp.submission !== 'CONFIRMED' ||
        otp.consumedAt ||
        otp.expiresAt <= now ||
        otp.pepperVersion !== Number(this.config.get('OTP_PEPPER_VERSION') ?? 1)
      )
        return { error: 'CHALLENGE_INVALID' } as const;
      if (c.userId) {
        const user = await tx.user.findUnique({ where: { id: c.userId } });
        if (
          !user ||
          user.isSuspended ||
          user.tokenVersion !== c.userTokenVersion ||
          (c.purpose !== 'EMAIL_CHANGE' &&
            user.emailNormalized !== c.emailNormalized) ||
          !this.mail.allowed(c.emailNormalized)
        ) {
          await tx.authChallenge.update({
            where: { id: c.id },
            data: { state: 'CANCELLED', failureReason: 'principal-changed' },
          });
          return { error: 'CHALLENGE_INVALID' } as const;
        }
      }
      if (
        c.firstFactor === 'GOOGLE' &&
        this.config.get('AUTH_GOOGLE_ENABLED') !== 'true'
      )
        return { error: 'CHALLENGE_INVALID' } as const;
      if (!equalHash(this.digest(c, c.currentGeneration, code), otp.codeHash)) {
        await tx.authChallenge.update({
          where: { id: c.id },
          data: {
            attempts: { increment: 1 },
            state: c.attempts + 1 >= 5 ? 'LOCKED' : 'READY',
          },
        });
        await this.events.record(
          tx,
          'OTP_REJECTED',
          c.userId,
          c.sessionId,
          { purpose: c.purpose },
          'failure',
        );
        return { error: 'CHALLENGE_INVALID' } as const;
      }
      const output = await complete(tx, c);
      await tx.authChallenge.update({
        where: { id: c.id },
        data: { state: 'CONSUMED', consumedAt: now },
      });
      await tx.emailOtp.update({
        where: { id: otp.id },
        data: { consumedAt: now },
      });
      await this.events.record(tx, 'OTP_VERIFIED', c.userId, c.sessionId, {
        purpose: c.purpose,
      });
      return { output };
    }).catch(async (e) => {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        await this.db.authChallenge.updateMany({
          where: { publicId, contextHash: ctx.contextHash, state: 'READY' },
          data: { state: 'CANCELLED', failureReason: 'conflict' },
        });
        throw authError('CHALLENGE_INVALID');
      }
      throw e;
    });
    if ('error' in outcome) throw authError(outcome.error!);
    return outcome.output;
  }
  @Interval(30000)
  async failAbandoned() {
    try {
      await serial(this.db, async (tx) => {
        const rows = await tx.authChallenge.findMany({
          where: {
            state: 'PENDING_SEND',
            updatedAt: { lte: plusMs(this.clock.now(), -30000) },
          },
          take: 500,
        });
        for (const c of rows) {
          await tx.authChallenge.update({
            where: { id: c.id },
            data: { state: 'FAILED' },
          });
          await tx.emailOtp.updateMany({
            where: {
              challengeId: c.id,
              generation: c.currentGeneration,
              submission: 'PENDING',
            },
            data: { submission: 'UNKNOWN' },
          });
        }
      });
    } catch {
      this.logger.error('OTP cleanup unavailable');
    }
  }
}
