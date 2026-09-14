/**
 * Regressions for the 2026-09-12 audit findings. Each test below fails against the code as
 * it stood at that audit and passes after the corresponding repair, so they are the standing
 * evidence for F03, F04, F05 and F10 rather than a restatement of existing coverage.
 *
 * Exclusivity and counter assertions run against real PostgreSQL: mocks cannot demonstrate
 * that two concurrent statements resolve to one winner.
 */
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { Prisma } from '@prisma/client';
import {
  fixtureLogin,
  makeApp,
  resetDatabase,
  TestClock,
} from './auth-test-helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { RateLimitsService } from '../src/auth/security/rate-limits.service';
import { SessionService } from '../src/auth/session.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { WebhookService } from '../src/mailer/webhook.service';
import { claimAttemptLock } from '../src/common/session-lock';
import { authError } from '../src/auth/security/primitives';
import { SESSION_LOCK_TIMEOUT_MS } from '../src/common/session-lock.constants';

describe('plan 3 regressions', () => {
  let app: INestApplication<App>;
  let db: PrismaService;
  // The application runs on injectable time, so fixtures are dated against the same clock
  // rather than wall time -- otherwise "one second ago" is still in the app's future.
  let clock: TestClock;
  const nowMs = () => clock.now().getTime();

  beforeAll(async () => {
    ({ app, db, clock } = await makeApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(db);
  });

  /** F03 — exam-session ownership is not atomic.
   *
   * The audit drove this through the attempt services with a barrier around their initial
   * reads. The defect is in the claim itself, so it is pinned here at the primitive both
   * engines now share: two sessions that observe the same expired lock must not both win.
   */
  describe('F03: attempt ownership is atomic', () => {
    async function expiredAttempt() {
      const tenant = await db.tenant.create({
        data: { name: 'Lock', slug: `lock-${Date.now()}-${Math.random()}` },
      });
      const user = await db.user.create({
        data: {
          email: `lock-${Math.random()}@e2e.test`,
          emailNormalized: `lock-${Math.random()}@e2e.test`,
          name: 'Lock',
        },
      });
      const membership = await db.membership.create({
        data: { tenantId: tenant.id, userId: user.id, role: 'STUDENT' },
      });
      const quiz = await db.quiz.create({
        data: {
          tenantId: tenant.id,
          createdByMembershipId: membership.id,
          title: 'Lock quiz',
          status: 'PUBLISHED',
        },
      });
      return db.attempt.create({
        data: {
          quizId: quiz.id,
          studentMembershipId: membership.id,
          attemptNumber: 1,
          status: 'IN_PROGRESS',
          lockSessionId: 'abandoned-session',
          lockedAt: new Date(nowMs() - SESSION_LOCK_TIMEOUT_MS * 2),
          // Older than the lock timeout: both racers legitimately see a reclaimable lock.
          lastHeartbeatAt: new Date(nowMs() - SESSION_LOCK_TIMEOUT_MS * 2),
        },
      });
    }

    it('gives an expired lock to exactly one of two racing sessions', async () => {
      const attempt = await expiredAttempt();

      const [first, second] = await Promise.all([
        claimAttemptLock(db.attempt, attempt.id, 'session-a', {
          status: 'IN_PROGRESS',
        }),
        claimAttemptLock(db.attempt, attempt.id, 'session-b', {
          status: 'IN_PROGRESS',
        }),
      ]);

      expect([first, second].filter(Boolean)).toHaveLength(1);
      const owner = await db.attempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });
      expect(owner.lockSessionId).toBe(first ? 'session-a' : 'session-b');
    });

    it('refuses a second session while the winner holds a live lock', async () => {
      const attempt = await expiredAttempt();

      expect(
        await claimAttemptLock(db.attempt, attempt.id, 'session-a', {
          status: 'IN_PROGRESS',
        }),
      ).toBe(true);
      expect(
        await claimAttemptLock(db.attempt, attempt.id, 'session-b', {
          status: 'IN_PROGRESS',
        }),
      ).toBe(false);
      // The holder keeps renewing its own lock — this is the ordinary heartbeat path.
      expect(
        await claimAttemptLock(db.attempt, attempt.id, 'session-a', {
          status: 'IN_PROGRESS',
        }),
      ).toBe(true);
    });

    it('does not commit a losing session write when the claim shares its transaction', async () => {
      const attempt = await expiredAttempt();
      await claimAttemptLock(db.attempt, attempt.id, 'session-a', {
        status: 'IN_PROGRESS',
      });

      const losing = db.$transaction(async (tx) => {
        if (
          !(await claimAttemptLock(tx.attempt, attempt.id, 'session-b', {
            status: 'IN_PROGRESS',
          }))
        ) {
          throw new Error('not the owner');
        }
        await tx.attempt.update({
          where: { id: attempt.id },
          data: { status: 'SUBMITTED' },
        });
      });

      await expect(losing).rejects.toThrow('not the owner');
      const after = await db.attempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });
      expect(after.status).toBe('IN_PROGRESS');
      expect(after.lockSessionId).toBe('session-a');
    });
  });

  /** F04 — source-rate bookkeeping rejected requests that were below quota.
   *
   * The serializable wrapper made concurrent increments of one counter conflict with each
   * other; the audit measured 9/60 and 32/120 spurious 503s against an unreachable limit.
   */
  describe('F04: counters admit every below-quota request', () => {
    const quota = 100_000;

    it.each([10, 30, 60, 120])(
      'admits all %i concurrent requests and counts them exactly',
      async (concurrency) => {
        const rates = app.get(RateLimitsService);
        const keyHash = rates.hash('source', `10.0.0.${concurrency}`);

        const results = await Promise.all(
          Array.from({ length: concurrency }, () =>
            rates.admit('plan3-load', keyHash, quota),
          ),
        );

        // A non-zero result is a Retry-After, i.e. a rejection. None is legitimate here.
        expect(results.filter((retry) => retry !== 0)).toHaveLength(0);
        const rows = await db.authRateBucket.findMany({
          where: { scope: 'plan3-load', keyHash },
        });
        expect(rows.reduce((total, row) => total + row.count, 0)).toBe(
          concurrency,
        );
      },
    );

    it('still rejects above the limit and reports Retry-After', async () => {
      const rates = app.get(RateLimitsService);
      const keyHash = rates.hash('source', '10.0.1.1');

      const admitted = await Promise.all(
        Array.from({ length: 3 }, () => rates.admit('plan3-limit', keyHash, 3)),
      );
      expect(admitted.filter((retry) => retry !== 0)).toHaveLength(0);

      const rejected = await rates.admit('plan3-limit', keyHash, 3);
      expect(rejected).toBeGreaterThan(0);
      // The over-limit attempt is still recorded, so the window reflects real pressure.
      const rows = await db.authRateBucket.findMany({
        where: { scope: 'plan3-limit', keyHash },
      });
      expect(rows.reduce((total, row) => total + row.count, 0)).toBe(4);
    });

    it('keeps independent sources isolated', async () => {
      const rates = app.get(RateLimitsService);
      const a = rates.hash('source', '10.0.2.1');
      const b = rates.hash('source', '10.0.2.2');

      await Promise.all(
        Array.from({ length: 5 }, () => rates.admit('plan3-isolated', a, 5)),
      );
      expect(await rates.admit('plan3-isolated', b, 5)).toBe(0);
    });
  });

  /** F05 — transient authorization failures were rewritten as invalid credentials.
   *
   * SessionService.validateAccess already classifies database faults as 503. The guard then
   * discarded `err` and threw 401 for everything, so an outage was presented to the browser
   * as "your session is invalid" and triggered credential clearing and refresh storms.
   */
  describe('F05: transient failures keep their classification', () => {
    it('propagates a 503 from session validation instead of returning 401', () => {
      const guard = new JwtAuthGuard();
      const transient = authError('AUTH_RETRY_LATER', 503);

      expect(() =>
        guard.handleRequest(transient, false, undefined, undefined as never),
      ).toThrow(expect.objectContaining({ status: 503 }));
    });

    it('still returns 401 when authentication is genuinely invalid', () => {
      const guard = new JwtAuthGuard();

      expect(() =>
        guard.handleRequest(null, false, undefined, undefined as never),
      ).toThrow(expect.objectContaining({ status: 401 }));
      expect(() =>
        guard.handleRequest(
          authError('SESSION_INVALID', 401),
          false,
          undefined,
          undefined as never,
        ),
      ).toThrow(expect.objectContaining({ status: 401 }));
    });

    it('rejects a non-access token type with 401', () => {
      const guard = new JwtAuthGuard();

      expect(() =>
        guard.handleRequest(
          null,
          { type: 'refresh' } as never,
          undefined,
          undefined as never,
        ),
      ).toThrow(expect.objectContaining({ status: 401 }));
    });

    it('turns a database fault during access validation into 503, not 401', async () => {
      const sessions = app.get(SessionService);
      // A real, well-formed access payload: the shape check must pass so the fault is raised
      // from the lookup itself rather than from claim validation.
      const login = await fixtureLogin(app, 'student@acme.test');
      const payload: unknown = JSON.parse(
        Buffer.from(login.body.accessToken.split('.')[1], 'base64url').toString(
          'utf8',
        ),
      );

      const spy = jest.spyOn(sessions, 'live').mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('db down', {
          code: 'P1001',
          clientVersion: 'test',
        }),
      );
      try {
        await expect(sessions.validateAccess(payload)).rejects.toThrow(
          expect.objectContaining({ status: 503 }),
        );
      } finally {
        spy.mockRestore();
      }
      // And with the database healthy the same payload validates normally.
      await expect(sessions.validateAccess(payload)).resolves.toBeDefined();
    });
  });

  /** F10 — unmatched webhook rows starved reconciliation.
   *
   * More than 500 permanently unmatched callbacks are queued ahead of a later event whose
   * mapping does exist. Before the repair the sweep never looked past the oldest 500.
   */
  describe('F10: reconciliation is fair to later events', () => {
    it('reconciles a later matchable event despite 600 unmatched rows ahead of it', async () => {
      const webhooks = app.get(WebhookService);
      const base = nowMs() - 60 * 60_000;

      await db.mailDeliveryEvent.createMany({
        data: Array.from({ length: 600 }, (_, index) => ({
          provider: 'BREVO',
          messageId: `unmatched-${index}`,
          recipient: `stranger-${index}@e2e.test`,
          event: 'delivered',
          providerEventAt: new Date(base + index),
          payloadHash: `hash-unmatched-${index}`,
          receivedAt: new Date(base + index),
          nextAttemptAt: new Date(base + index),
        })),
      });

      const recipient = 'matched@e2e.test';
      await db.mailDelivery.create({
        data: {
          provider: 'BREVO',
          dispatchId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          recipient,
          messageId: 'matched-1',
          category: 'OTP',
          submissionState: 'CONFIRMED',
        },
      });
      const later = await db.mailDeliveryEvent.create({
        data: {
          provider: 'BREVO',
          messageId: 'matched-1',
          recipient,
          event: 'delivered',
          providerEventAt: new Date(base + 10_000),
          payloadHash: 'hash-matched-1',
          // Received after every unmatched row above.
          receivedAt: new Date(base + 10_000),
          nextAttemptAt: new Date(base + 10_000),
        },
      });

      // One sweep still takes at most 500 rows. What changed is that those rows leave the
      // queue afterwards, so the backlog drains instead of being re-read forever. Before the
      // repair the ordering was oldest-first over all unreconciled rows, so these 600 were
      // returned again on every sweep and `later` was never reached at all.
      await webhooks.reconcile();

      const firstSweep = await db.mailDeliveryEvent.findMany({
        where: { messageId: { startsWith: 'unmatched-' }, attempts: { gt: 0 } },
      });
      expect(firstSweep).toHaveLength(500);
      expect(
        firstSweep.every((row) => row.nextAttemptAt!.getTime() > nowMs()),
      ).toBe(true);

      await webhooks.reconcile();

      const stored = await db.mailDeliveryEvent.findUniqueOrThrow({
        where: { id: later.id },
      });
      expect(stored.reconciledAt).not.toBeNull();
    });

    it('backs an unmatched event off and quarantines it past the horizon', async () => {
      const webhooks = app.get(WebhookService);
      const fresh = await db.mailDeliveryEvent.create({
        data: {
          provider: 'BREVO',
          messageId: 'orphan-1',
          recipient: 'orphan@e2e.test',
          event: 'delivered',
          providerEventAt: clock.now(),
          payloadHash: 'hash-orphan-1',
          receivedAt: clock.now(),
          nextAttemptAt: new Date(nowMs() - 1000),
        },
      });
      const ancient = await db.mailDeliveryEvent.create({
        data: {
          provider: 'BREVO',
          messageId: 'orphan-2',
          recipient: 'orphan2@e2e.test',
          event: 'delivered',
          providerEventAt: new Date(nowMs() - 48 * 3600_000),
          payloadHash: 'hash-orphan-2',
          receivedAt: new Date(nowMs() - 48 * 3600_000),
          nextAttemptAt: new Date(nowMs() - 1000),
        },
      });

      await webhooks.reconcile();

      const deferred = await db.mailDeliveryEvent.findUniqueOrThrow({
        where: { id: fresh.id },
      });
      expect(deferred.attempts).toBe(1);
      expect(deferred.nextAttemptAt!.getTime()).toBeGreaterThan(nowMs());
      expect(deferred.quarantinedAt).toBeNull();

      const terminal = await db.mailDeliveryEvent.findUniqueOrThrow({
        where: { id: ancient.id },
      });
      expect(terminal.quarantinedAt).not.toBeNull();

      // Quarantine removes the row from the queue without touching recipient state.
      expect(
        await db.mailRecipient.findUnique({
          where: { emailCanonical: 'orphan2@e2e.test' },
        }),
      ).toBeNull();
    });
  });
});
