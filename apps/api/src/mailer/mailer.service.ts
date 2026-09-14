import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { MailOutbox, Prisma } from '@prisma/client';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthClock,
  DAY,
  Tx,
  plusMs,
  serial,
  sha256,
} from '../auth/security/primitives';
import {
  MAIL_DRIVER_TOKEN,
  type MailDriver,
  type MailMessage,
  MailError,
} from './mail-driver';
import { noticeTemplate, otpTemplate } from './templates';
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private working = false;
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly clock: AuthClock,
    @Inject(MAIL_DRIVER_TOKEN) readonly driver: MailDriver,
  ) {}
  allowed(email: string) {
    return (
      this.config.get<string>('AUTH_RELEASE_STAGE') !== 'hosted-test' ||
      String(this.config.get('AUTH_TEST_EMAIL_ALLOWLIST') ?? '')
        .split(',')
        .includes(email)
    );
  }
  sender() {
    return {
      email: this.config.get<string>('MAIL_FROM_EMAIL') ?? 'local@example.test',
      name: this.config.get<string>('MAIL_FROM_NAME') ?? 'Quiz Platform',
    };
  }
  encrypt(text: string) {
    const nonce = randomBytes(12),
      cipher = createCipheriv(
        'aes-256-gcm',
        Buffer.from(
          this.config.getOrThrow<string>('MAIL_PAYLOAD_KEY'),
          'base64',
        ),
        nonce,
      );
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    return {
      renderedPayloadCiphertext: encrypted.toString('base64'),
      payloadNonce: nonce.toString('base64'),
      payloadKeyVersion: Number(
        this.config.get('MAIL_PAYLOAD_KEY_VERSION') ?? 1,
      ),
      renderedContentHash: sha256(text),
    };
  }
  decrypt(
    row: Pick<
      MailOutbox,
      | 'renderedPayloadCiphertext'
      | 'payloadNonce'
      | 'payloadKeyVersion'
      | 'renderedContentHash'
    >,
  ) {
    const current = Number(this.config.get('MAIL_PAYLOAD_KEY_VERSION') ?? 1);
    const key =
      row.payloadKeyVersion === current
        ? this.config.get<string>('MAIL_PAYLOAD_KEY')
        : this.config.get<string>(`MAIL_PAYLOAD_KEY_V${row.payloadKeyVersion}`);
    if (!key || !row.renderedPayloadCiphertext || !row.payloadNonce)
      throw new MailError('configuration');
    const data = Buffer.from(row.renderedPayloadCiphertext, 'base64'),
      decipher = createDecipheriv(
        'aes-256-gcm',
        Buffer.from(key, 'base64'),
        Buffer.from(row.payloadNonce, 'base64'),
      );
    decipher.setAuthTag(data.subarray(-16));
    const plain = Buffer.concat([
      decipher.update(data.subarray(0, -16)),
      decipher.final(),
    ]).toString('utf8');
    if (sha256(plain) !== row.renderedContentHash)
      throw new MailError('configuration');
    return plain;
  }
  async alert(
    tx: Tx,
    type: string,
    dedupeKey: string,
    metadata: Prisma.InputJsonObject = {},
  ) {
    await tx.operationalAlert.upsert({
      where: { dedupeKey },
      create: { type, dedupeKey, metadata, createdAt: this.clock.now() },
      update: {},
    });
  }
  async reserve(
    tx: Tx,
    m: Pick<MailMessage, 'dispatchId' | 'category' | 'recipient'>,
    attemptNumber: number,
  ): Promise<boolean> {
    const now = this.clock.now();
    if (!this.allowed(m.recipient)) return false;
    const recipient = await tx.mailRecipient.findUnique({
      where: { emailCanonical: m.recipient },
    });
    if (recipient?.state === 'SUPPRESSED') return false;
    const day = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${'mail-budget:' + day.toISOString()}, 0))`;
    const budget = await tx.mailSendBudget.upsert({
      where: { day },
      create: { day },
      update: {},
    });
    if (
      budget.totalAttempts >= 200 ||
      (m.category !== 'OTP' && budget.nonOtpAttempts >= 50)
    )
      return false;
    const next = await tx.mailSendBudget.update({
      where: { day },
      data: {
        totalAttempts: { increment: 1 },
        ...(m.category === 'OTP'
          ? { otpAttempts: { increment: 1 } }
          : { nonOtpAttempts: { increment: 1 } }),
      },
    });
    await tx.mailAttempt.create({
      data: {
        dispatchId: m.dispatchId,
        attemptNumber,
        category: m.category,
        reservedAt: now,
      },
    });
    if (next.totalAttempts >= 160 && !budget.budgetAlertedAt) {
      await this.alert(tx, 'MAIL_BUDGET', `budget:${day.toISOString()}`);
      await tx.mailSendBudget.update({
        where: { day },
        data: { budgetAlertedAt: now },
      });
    }
    const count = await tx.mailAttempt.count({
      where: { reservedAt: { gt: plusMs(now, -900000) } },
    });
    if (count >= 25) {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${'mail-rate-alert'}, 0))`;
      const last = await tx.operationalAlert.findFirst({
        where: { type: 'MAIL_RATE', createdAt: { gt: plusMs(now, -3600000) } },
      });
      if (!last)
        await this.alert(tx, 'MAIL_RATE', `mail-rate:${now.toISOString()}`);
    }
    await tx.mailDelivery.upsert({
      where: { dispatchId: m.dispatchId },
      create: {
        dispatchId: m.dispatchId,
        recipient: m.recipient,
        provider: this.driver.name,
        category: m.category,
        submissionState: 'PENDING',
      },
      update: {},
    });
    return true;
  }
  async dispatch(
    m: MailMessage,
    attempt: number,
  ): Promise<{ providerMessageId: string }> {
    try {
      const sent = await this.driver.send(m);
      await serial(this.db, async (tx) => {
        await tx.mailAttempt.update({
          where: {
            dispatchId_attemptNumber: {
              dispatchId: m.dispatchId,
              attemptNumber: attempt,
            },
          },
          data: {
            outcome: 'ACCEPTED',
            providerMessageId: sent.providerMessageId,
          },
        });
        await tx.mailDelivery.update({
          where: { dispatchId: m.dispatchId },
          data: {
            messageId: sent.providerMessageId,
            submissionState: 'CONFIRMED',
          },
        });
      });
      return sent;
    } catch (e) {
      const err = e instanceof MailError ? e : new MailError('ambiguous');
      await serial(this.db, async (tx) => {
        const unknown = ['ambiguous', 'duplicate'].includes(err.kind);
        await tx.mailAttempt.update({
          where: {
            dispatchId_attemptNumber: {
              dispatchId: m.dispatchId,
              attemptNumber: attempt,
            },
          },
          data: {
            outcome: unknown ? 'UNKNOWN' : 'REJECTED',
            providerCode: err.providerCode ?? err.kind,
          },
        });
        await tx.mailDelivery.update({
          where: { dispatchId: m.dispatchId },
          data: { submissionState: unknown ? 'UNKNOWN' : 'FAILED' },
        });
        if (['configuration', 'quota_exceeded'].includes(err.kind))
          await this.alert(
            tx,
            'MAIL_PROVIDER',
            `provider:${err.kind}:${this.clock.now().toISOString().slice(0, 13)}`,
            { kind: err.kind },
          );
        if (err.kind === 'invalid_recipient')
          await tx.mailRecipient.upsert({
            where: { emailCanonical: m.recipient },
            create: {
              emailCanonical: m.recipient,
              state: 'SUPPRESSED',
              reason: 'invalid_recipient',
              suppressedAt: this.clock.now(),
            },
            update: {
              state: 'SUPPRESSED',
              reason: 'invalid_recipient',
              suppressedAt: this.clock.now(),
            },
          });
      });
      throw err;
    }
  }
  otpMessage(
    recipient: string,
    purpose: string,
    code: string,
    dispatchId: string,
    expiresAt: Date,
  ): MailMessage {
    return {
      recipient,
      category: 'OTP',
      dispatchId,
      idempotencyKey: `otp:${dispatchId}`,
      sender: this.sender(),
      replyTo: this.config.get('MAIL_REPLY_TO'),
      ...otpTemplate(
        purpose,
        code,
        this.config.getOrThrow('WEB_ORIGIN'),
        (expiresAt.getTime() - this.clock.now().getTime()) / 1000,
      ),
    };
  }
  /** Initial attempt already reserved in the same transaction as the OTP generation. */
  async sendOtp(m: MailMessage, expiresAt: Date) {
    try {
      return await this.dispatch(m, 1);
    } catch (e) {
      if (
        !(e instanceof MailError) ||
        !e.transient ||
        e.retryAfter > 0 ||
        expiresAt <= this.clock.now()
      )
        throw e;
      if (!(await serial(this.db, (tx) => this.reserve(tx, m, 2))))
        throw new MailError('budget');
      return this.dispatch(m, 2);
    }
  }
  async queue(
    tx: Tx,
    recipient: string,
    kind: 'INVITE' | 'SECURITY',
    detail: string,
    options: {
      token?: string;
      invitationId?: string;
      expiresAt?: Date;
      dedupeKey?: string;
    } = {},
  ) {
    if (!this.allowed(recipient)) return;
    const now = this.clock.now(),
      dispatchId = randomUUID(),
      origin = this.config.getOrThrow<string>('WEB_ORIGIN');
    if (options.dedupeKey) {
      const exists = await tx.mailOutbox.findUnique({
        where: { idempotencyKey: options.dedupeKey },
      });
      if (exists) return;
    }
    const message: MailMessage = {
      recipient,
      category: kind,
      dispatchId,
      idempotencyKey:
        options.dedupeKey ?? `${kind.toLowerCase()}:${dispatchId}`,
      sender: this.sender(),
      replyTo: this.config.get('MAIL_REPLY_TO'),
      ...noticeTemplate(kind, origin, detail, options.token),
    };
    await tx.mailOutbox.create({
      data: {
        category: kind,
        recipient,
        templateType: kind,
        templateVersion: 1,
        payload: {
          detail,
          ...(options.invitationId
            ? { invitationId: options.invitationId }
            : {}),
        },
        senderSnapshot: this.sender(),
        appOriginSnapshot: origin,
        dispatchId,
        idempotencyKey: message.idempotencyKey,
        nextAttemptAt: now,
        expiresAt: options.expiresAt ?? plusMs(now, 2 * DAY),
        ...this.encrypt(JSON.stringify(message)),
      },
    });
  }
  async cancelInvite(tx: Tx, id: string) {
    await tx.mailOutbox.updateMany({
      where: {
        category: 'INVITE',
        payload: { path: ['invitationId'], equals: id },
        status: { in: ['PENDING', 'SENDING', 'UNKNOWN'] },
      },
      data: {
        status: 'CANCELLED',
        renderedPayloadCiphertext: null,
        payloadNonce: null,
      },
    });
  }
  @Interval(10000)
  async poll() {
    if (this.working) return;
    this.working = true;
    try {
      const jobs = await serial(this.db, async (tx) => {
        const now = this.clock.now();
        await tx.mailOutbox.updateMany({
          where: { status: 'SENDING', leaseExpiresAt: { lt: now } },
          data: {
            status: 'PENDING',
            lastErrorKind: 'ambiguous',
            nextAttemptAt: now,
          },
        });
        await tx.mailOutbox.updateMany({
          where: {
            status: { in: ['PENDING', 'SENDING', 'UNKNOWN'] },
            expiresAt: { lte: now },
          },
          data: {
            status: 'CANCELLED',
            renderedPayloadCiphertext: null,
            payloadNonce: null,
          },
        });
        const due = await tx.$queryRaw<
          MailOutbox[]
        >`SELECT * FROM "MailOutbox" WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${now} AND "expiresAt" > ${now} ORDER BY "nextAttemptAt" LIMIT 20 FOR UPDATE SKIP LOCKED`;
        const jobs: MailOutbox[] = [];
        for (const row of due)
          jobs.push(
            await tx.mailOutbox.update({
              where: { id: row.id },
              data: {
                status: 'SENDING',
                leaseOwner: randomUUID(),
                leaseExpiresAt: plusMs(now, 30000),
              },
            }),
          );
        return jobs;
      });
      await Promise.allSettled(jobs.map((j) => this.process(j)));
    } catch {
      this.logger.error('Mail outbox poll failed; retrying on next poll');
    } finally {
      this.working = false;
    }
  }
  private async process(job: MailOutbox) {
    const now = this.clock.now(),
      first = job.firstAttemptAt ?? now,
      attempt = job.attemptCount + 1;
    let error: MailError | undefined;
    if (
      job.attemptCount >= 6 ||
      (job.lastErrorKind === 'ambiguous' &&
        now.getTime() - first.getTime() >= 1800000)
    )
      error = new MailError('ambiguous');
    if (error) {
      await this.finish(job, 'UNKNOWN', 'ambiguous');
      return;
    }
    let m: MailMessage;
    try {
      m = JSON.parse(this.decrypt(job)) as MailMessage;
    } catch {
      await this.finish(job, 'FAILED', 'configuration');
      return;
    }
    const reserved = await serial(this.db, async (tx) => {
      const current = await tx.mailOutbox.findUnique({ where: { id: job.id } });
      if (
        current?.status !== 'SENDING' ||
        current.leaseOwner !== job.leaseOwner
      )
        return 'cancelled';
      if (job.category === 'INVITE') {
        const id = (job.payload as { invitationId?: string }).invitationId;
        const invite = id
          ? await tx.memberInvitation.findUnique({ where: { id } })
          : null;
        if (
          !invite ||
          invite.status !== 'PENDING' ||
          invite.expiresAt <= this.clock.now()
        ) {
          await this.cancelInvite(tx, id ?? '');
          return 'cancelled';
        }
      }
      if (!(await this.reserve(tx, m, attempt))) return 'budget';
      await tx.mailOutbox.update({
        where: { id: job.id },
        data: { attemptCount: attempt, firstAttemptAt: first },
      });
      return 'ok';
    });
    if (reserved === 'cancelled') return;
    if (reserved === 'budget') {
      const next = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
      next.setUTCDate(next.getUTCDate() + 1);
      await this.db.mailOutbox.updateMany({
        where: { id: job.id, leaseOwner: job.leaseOwner, status: 'SENDING' },
        data: {
          status: 'PENDING',
          nextAttemptAt: next,
          lastErrorKind: 'budget',
        },
      });
      return;
    }
    try {
      await this.dispatch(m, attempt);
      await this.finish(job, 'SENT');
      return;
    } catch (e) {
      error = e instanceof MailError ? e : new MailError('ambiguous');
    }
    const ambiguous =
      ['ambiguous', 'duplicate'].includes(error.kind) ||
      job.lastErrorKind === 'ambiguous';
    if (
      attempt >= 6 ||
      (!error.transient && error.kind !== 'duplicate') ||
      (ambiguous && this.clock.now().getTime() - first.getTime() >= 1800000)
    ) {
      await this.finish(job, ambiguous ? 'UNKNOWN' : 'FAILED', error.kind);
      return;
    }
    const delays = [60000, 300000, 1800000, 7200000, 86400000];
    let next = plusMs(
      first,
      Math.round(delays[attempt - 1] * (0.9 + Math.random() * 0.2)),
    );
    if (ambiguous && next.getTime() - first.getTime() > 1800000)
      next = plusMs(first, 1800000);
    next = new Date(
      Math.max(
        next.getTime(),
        this.clock.now().getTime() + error.retryAfter * 1000,
      ),
    );
    await this.db.mailOutbox.updateMany({
      where: { id: job.id, leaseOwner: job.leaseOwner, status: 'SENDING' },
      data: {
        status: 'PENDING',
        nextAttemptAt: next,
        lastErrorKind: ambiguous ? 'ambiguous' : error.kind,
      },
    });
  }
  private async finish(
    job: MailOutbox,
    status: 'SENT' | 'FAILED' | 'UNKNOWN',
    kind?: string,
  ) {
    await serial(this.db, async (tx) => {
      await tx.mailOutbox.updateMany({
        where: { id: job.id, leaseOwner: job.leaseOwner, status: 'SENDING' },
        data: {
          status,
          lastErrorKind: kind,
          renderedPayloadCiphertext: null,
          payloadNonce: null,
        },
      });
      if (status !== 'SENT')
        await this.alert(tx, 'MAIL_OUTBOX', `outbox:${job.id}`, {
          kind: kind ?? 'unknown',
        });
    });
  }
  async health() {
    const now = this.clock.now(),
      day = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
    const [budget, pending, oldest, unknown, suppressed, lastWebhook, alerts] =
      await Promise.all([
        this.db.mailSendBudget.findUnique({ where: { day } }),
        this.db.mailOutbox.count({
          where: { status: { in: ['PENDING', 'SENDING'] } },
        }),
        this.db.mailOutbox.findFirst({
          where: { status: 'PENDING' },
          orderBy: { nextAttemptAt: 'asc' },
          select: { nextAttemptAt: true },
        }),
        this.db.mailDelivery.count({ where: { submissionState: 'UNKNOWN' } }),
        this.db.mailRecipient.count({ where: { state: 'SUPPRESSED' } }),
        this.db.mailDeliveryEvent.findFirst({
          orderBy: { receivedAt: 'desc' },
          select: { receivedAt: true },
        }),
        this.db.operationalAlert.findMany({
          where: { acknowledgedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, type: true, createdAt: true, metadata: true },
        }),
      ]);
    return {
      driver: this.driver.name,
      stage: this.config.get<string>('AUTH_RELEASE_STAGE'),
      otpMode: this.config.get<string>('AUTH_OTP_MODE'),
      googleEnabled: this.config.get('AUTH_GOOGLE_ENABLED') === 'true',
      senderAuthenticated:
        this.config.get('MAIL_SENDER_AUTHENTICATED') === 'true',
      budget: {
        attempts: budget?.totalAttempts ?? 0,
        remaining: 200 - (budget?.totalAttempts ?? 0),
        nonOtpRemaining: 50 - (budget?.nonOtpAttempts ?? 0),
      },
      outbox: { pending, oldestDueAt: oldest?.nextAttemptAt ?? null },
      unknown,
      suppressed,
      lastWebhookAt: lastWebhook?.receivedAt ?? null,
      alerts,
    };
  }
}
