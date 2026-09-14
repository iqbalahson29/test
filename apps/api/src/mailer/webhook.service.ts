import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { normalizeIdentifier } from '@quiz-platform/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthClock,
  Tx,
  authError,
  plusMs,
  serial,
  sha256,
} from '../auth/security/primitives';
import { MailerService } from './mailer.service';
import { messageId } from './mail-driver';
const EVENTS = new Set([
  'request',
  'hard_bounce',
  'soft_bounce',
  'invalid_email',
  'delivered',
  'deferred',
  'blocked',
  'spam',
  'unsubscribed',
  'error',
]);
const HARD = new Set([
  'hard_bounce',
  'invalid_email',
  'spam',
  'unsubscribed',
  'blocked',
]);
const UNMATCHED_ALERT_MS = 900_000;
const UNMATCHED_QUARANTINE_MS = 86_400_000;
/** Bounded backoff for an event still waiting on its delivery mapping: 1 minute doubling to
 * an hour. Bounded so a matching send recorded later is still picked up promptly. */
const backoffMs = (attempts: number) =>
  Math.min(60 * 60_000, 60_000 * 2 ** Math.min(attempts - 1, 6));
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly clock: AuthClock,
    private readonly mailer: MailerService,
  ) {}
  async receive(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw authError('VALIDATION_ERROR');
    const p = input as Record<string, unknown>;
    if (
      typeof p.event !== 'string' ||
      p.event.length > 50 ||
      typeof p['message-id'] !== 'string' ||
      p['message-id'].length > 512 ||
      typeof p.email !== 'string' ||
      !Number.isSafeInteger(p.ts_event) ||
      Number(p.ts_event) < 0
    )
      throw authError('VALIDATION_ERROR');
    let recipient: string;
    try {
      recipient = normalizeIdentifier(p.email).normalized;
    } catch {
      throw authError('VALIDATION_ERROR');
    }
    if (!EVENTS.has(p.event)) {
      this.logger.warn('Unknown transactional webhook event ignored');
      return;
    }
    const eventAt = new Date(Number(p.ts_event) * 1000);
    if (
      !Number.isFinite(eventAt.getTime()) ||
      eventAt > plusMs(this.clock.now(), 60000)
    )
      throw authError('VALIDATION_ERROR');
    // Reasons are allowlisted classifications, never provider free text / message content.
    const reason =
      typeof p.reason === 'string'
        ? /sender|domain|configuration|authentication/i.test(p.reason)
          ? 'sender_configuration'
          : /mailbox|recipient|address/i.test(p.reason)
            ? 'recipient'
            : 'provider_reported'
        : null;
    const custom = p['X-Mailin-custom'] ?? p['X-Mailin-Custom'];
    const dispatchId =
      typeof custom === 'string' && /^[a-f0-9-]{36}$/i.test(custom)
        ? custom
        : null;
    const safe = {
      event: p.event,
      messageId: messageId(p['message-id']),
      recipient,
      ts_event: p.ts_event,
      reason,
      dispatchId,
    };
    const data = {
      provider: 'BREVO',
      messageId: safe.messageId,
      recipient,
      event: p.event,
      providerEventAt: eventAt,
      payloadHash: sha256(JSON.stringify(safe)),
      receivedAt: this.clock.now(),
      nextAttemptAt: this.clock.now(),
      reason,
      dispatchId,
    };
    try {
      await serial(this.db, async (tx) => {
        await tx.mailDeliveryEvent.create({ data });
        await this.reconcileOne(tx, data.messageId, recipient, dispatchId);
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        return;
      throw e;
    }
  }
  private async reconcileOne(
    tx: Tx,
    id: string,
    recipient: string,
    dispatchId?: string | null,
  ) {
    let delivery = await tx.mailDelivery.findFirst({
      where: { provider: 'BREVO', messageId: id, recipient },
    });
    if (!delivery && dispatchId) {
      delivery = await tx.mailDelivery.findFirst({
        where: { provider: 'BREVO', dispatchId, recipient },
      });
      if (delivery) {
        if (delivery.messageId && delivery.messageId !== id) return;
        await tx.mailDelivery.update({
          where: { id: delivery.id },
          data: { messageId: id },
        });
      }
    }
    if (!delivery) return;
    await tx.mailDeliveryEvent.updateMany({
      where: {
        provider: 'BREVO',
        messageId: id,
        recipient,
        reconciledAt: null,
      },
      data: { reconciledAt: this.clock.now() },
    });
    const deliveries = await tx.mailDelivery.findMany({
      where: { provider: 'BREVO', recipient, messageId: { not: null } },
      select: { messageId: true },
    });
    const events = await tx.mailDeliveryEvent.findMany({
      where: {
        provider: 'BREVO',
        recipient,
        messageId: { in: deliveries.map((d) => d.messageId!) },
      },
      orderBy: [{ providerEventAt: 'asc' }, { event: 'asc' }],
    });
    const prior = await tx.mailRecipient.upsert({
      where: { emailCanonical: recipient },
      create: { emailCanonical: recipient },
      update: {},
    });
    const relevant = events.filter(
      (e) => !prior.lastClearedAt || e.providerEventAt > prior.lastClearedAt,
    );
    let hard =
      prior.state === 'SUPPRESSED' && prior.reason !== 'temporary_failures'
        ? prior.reason
        : null;
    const failed = new Set<string>();
    let latest = prior.lastEventAt;
    let deliveredAt: Date | null = null;
    for (const e of relevant) {
      if (HARD.has(e.event)) {
        hard = e.event;
        if (e.event === 'blocked' && e.reason === 'sender_configuration')
          await this.mailer.alert(tx, 'MAIL_SENDER', `sender:${e.id}`);
      }
      if (e.event === 'delivered') {
        failed.clear();
        deliveredAt = e.providerEventAt;
      }
      if (e.event === 'soft_bounce' || e.event === 'deferred')
        failed.add(e.messageId);
      if (!latest || e.providerEventAt > latest) latest = e.providerEventAt;
    }
    const suppress = !!hard || failed.size >= 5;
    await tx.mailRecipient.update({
      where: { emailCanonical: recipient },
      data: {
        softFailureCount: failed.size,
        lastEventAt: latest,
        ...(suppress
          ? {
              state: 'SUPPRESSED',
              reason: hard ?? 'temporary_failures',
              suppressedAt: prior.suppressedAt ?? this.clock.now(),
            }
          : {
              ...(prior.state === 'OK' ? { state: 'OK' as const } : {}),
              ...(deliveredAt ? { softFailureCount: failed.size } : {}),
            }),
      },
    });
    const last = events.filter((e) => e.messageId === id).at(-1);
    if (last)
      await tx.mailDelivery.update({
        where: { id: delivery.id },
        data: { deliveryState: last.event, lastEventAt: last.providerEventAt },
      });
    if (suppress && prior.state !== 'SUPPRESSED')
      await tx.securityEvent.create({
        data: {
          type: 'EMAIL_SUPPRESSED',
          outcome: 'failure',
          metadata: { reason: hard ?? 'temporary_failures' },
        },
      });
  }
  @Interval(60000)
  async reconcile() {
    try {
      // Due-first, not oldest-first. The old query always re-read the oldest 500 unreconciled
      // rows, so a block of callbacks that never acquire a delivery mapping kept every later
      // event from ever being visited. Each unmatched row now backs off on its own schedule.
      const now = this.clock.now();
      const rows = await this.db.mailDeliveryEvent.findMany({
        where: {
          reconciledAt: null,
          quarantinedAt: null,
          nextAttemptAt: { lte: now },
        },
        orderBy: { nextAttemptAt: 'asc' },
        take: 500,
      });
      for (const row of rows)
        await serial(this.db, async (tx) => {
          await this.reconcileOne(
            tx,
            row.messageId,
            row.recipient,
            row.dispatchId,
          );
          const stored = await tx.mailDeliveryEvent.findUnique({
            where: { id: row.id },
          });
          if (stored?.reconciledAt) return;
          if (row.receivedAt < plusMs(this.clock.now(), -UNMATCHED_ALERT_MS))
            await this.mailer.alert(
              tx,
              'WEBHOOK_UNMATCHED',
              `webhook:${row.id}`,
            );
          const attempts = row.attempts + 1;
          // Past the quarantine horizon the mapping is not going to arrive. The row leaves the
          // queue and nothing else about the recipient changes.
          const quarantined =
            row.receivedAt < plusMs(this.clock.now(), -UNMATCHED_QUARANTINE_MS);
          await tx.mailDeliveryEvent.update({
            where: { id: row.id },
            data: {
              attempts,
              nextAttemptAt: plusMs(this.clock.now(), backoffMs(attempts)),
              ...(quarantined ? { quarantinedAt: this.clock.now() } : {}),
            },
          });
        });
      await serial(this.db, async (tx) => {
        const now = this.clock.now(),
          window = plusMs(now, -900000),
          attempts = await tx.mailAttempt.findMany({
            where: { reservedAt: { gt: window } },
          });
        if (
          attempts.length >= 20 &&
          attempts.filter((a) => a.outcome === 'REJECTED').length /
            attempts.length >
            0.05
        )
          await this.mailer.alert(
            tx,
            'MAIL_REJECTIONS',
            `reject:${now.toISOString().slice(0, 13)}`,
          );
        const oldest = await tx.mailOutbox.findFirst({
          where: {
            status: 'PENDING',
            nextAttemptAt: { lt: plusMs(now, -300000) },
          },
        });
        if (oldest)
          await this.mailer.alert(tx, 'OUTBOX_OVERDUE', `overdue:${oldest.id}`);
        const missing = await tx.mailDelivery.findFirst({
          where: {
            submissionState: 'CONFIRMED',
            lastEventAt: null,
            createdAt: { lt: plusMs(now, -900000) },
          },
        });
        if (missing)
          await this.mailer.alert(
            tx,
            'WEBHOOK_MISSING',
            `missing:${missing.dispatchId}`,
          );
      });
    } catch {
      this.logger.error('Webhook reconciliation unavailable');
    }
  }
}
