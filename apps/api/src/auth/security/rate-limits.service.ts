import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isIP } from 'node:net';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthClock,
  DAY,
  authError,
  hmac,
  plusMs,
  serial,
  Tx,
} from './primitives';
export function normalizeSource(ip: string): string {
  const stripped =
    ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
  if (isIP(stripped) === 4) return stripped;
  if (isIP(stripped) === 6) {
    const [left, right = ''] = stripped.toLowerCase().split('::');
    const a = left ? left.split(':') : [];
    const b = right ? right.split(':') : [];
    const all = [
      ...a,
      ...(Array(Math.max(0, 8 - a.length - b.length)).fill('0') as string[]),
      ...b,
    ];
    return (
      all
        .slice(0, 4)
        .map((x) => parseInt(x, 16).toString(16))
        .join(':') + '::/64'
    );
  }
  return 'unknown';
}
@Injectable()
export class RateLimitsService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: AuthClock,
    private readonly config: ConfigService,
  ) {}
  hash(kind: string, value: string) {
    return hmac(
      this.config.getOrThrow('AUTH_HASH_KEY'),
      `${kind}:v1|${kind === 'source' ? normalizeSource(value) : value}`,
    );
  }
  async bucket(
    tx: Tx,
    scope: string,
    keyHash: string,
    limit: number,
    windowMs = 60000,
  ): Promise<number> {
    const now = this.clock.now();
    const windowStart = new Date(
      Math.floor(now.getTime() / windowMs) * windowMs,
    );
    const expiresAt = plusMs(windowStart, windowMs);
    const row = await tx.authRateBucket.upsert({
      where: { scope_keyHash_windowStart: { scope, keyHash, windowStart } },
      create: { scope, keyHash, windowStart, expiresAt, count: 1 },
      update: { count: { increment: 1 } },
    });
    return row.count > limit
      ? Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000))
      : 0;
  }
  /** Increments one counter and returns its committed value.
   *
   * A single `INSERT ... ON CONFLICT DO UPDATE` is already atomic, so this deliberately runs
   * outside `serial()`. Wrapping it in a serializable transaction made concurrent increments
   * of the *same* row conflict with each other, and the retry budget then surfaced ordinary
   * traffic as 503s well below the configured quota — a classroom behind one NAT could fail
   * for no reason. Multi-record invariants (aggregate login risk, mail budgets, OTP send
   * reservations) still take the stronger isolation and advisory locks they need.
   *
   * `count` is returned post-increment, so over-limit requests still record their attempt. */
  private async countIn(
    scope: string,
    keyHash: string,
    windowStart: Date,
    expiresAt: Date,
  ): Promise<number> {
    const rows = await this.db.$queryRaw<{ count: number }[]>`
      INSERT INTO "AuthRateBucket" ("scope","keyHash","windowStart","count","expiresAt","createdAt","updatedAt")
      VALUES (${scope}, ${keyHash}, ${windowStart}, 1, ${expiresAt}, NOW(), NOW())
      ON CONFLICT ("scope","keyHash","windowStart")
      DO UPDATE SET "count" = "AuthRateBucket"."count" + 1, "updatedAt" = NOW()
      RETURNING "count"`;
    return Number(rows[0]?.count ?? 1);
  }
  /** Atomic single-counter admission check. Returns Retry-After seconds, or 0 when admitted. */
  async admit(
    scope: string,
    keyHash: string,
    limit: number,
    windowMs = 60000,
  ): Promise<number> {
    const now = this.clock.now();
    const windowStart = new Date(
      Math.floor(now.getTime() / windowMs) * windowMs,
    );
    const expiresAt = plusMs(windowStart, windowMs);
    const count = await this.countIn(scope, keyHash, windowStart, expiresAt);
    return count > limit
      ? Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000))
      : 0;
  }
  async gate(scope: string, source: string, limit = 10, window = 60000) {
    const retry = await this.admit(
      scope,
      this.hash('source', source),
      limit,
      window,
    );
    if (retry) throw authError('RATE_LIMITED', 429, retry);
  }
  async publicGate(route: string, source: string) {
    await this.gate(`public:${route}`, source);
    await this.gate('public:shared', source, 100, 3600000);
  }
  async sessionGate(
    route: string,
    sessionId: string,
    source: string,
    limit = 10,
  ) {
    await this.gate(route, source, route === 'refresh' ? 120 : 10);
    const retry = await this.admit(
      `${route}:session`,
      this.hash('session', sessionId),
      limit,
    );
    if (retry) throw authError('RATE_LIMITED', 429, retry);
  }
  async loginGate(identifier: string, source: string) {
    const row = await this.db.loginFailure.findUnique({
      where: {
        identifierHash_sourceHash: {
          identifierHash: this.hash('identifier', identifier),
          sourceHash: this.hash('source', source),
        },
      },
    });
    const now = this.clock.now();
    if (
      row &&
      now.getTime() - row.lastFailedAt.getTime() < DAY &&
      row.nextAllowedAt > now
    )
      throw authError(
        'RATE_LIMITED',
        429,
        Math.ceil((row.nextAllowedAt.getTime() - now.getTime()) / 1000),
      );
  }
  async badPassword(identifier: string, source: string, userId?: string) {
    await serial(this.db, async (tx) => {
      const now = this.clock.now(),
        identifierHash = this.hash('identifier', identifier),
        sourceHash = this.hash('source', source);
      const old = await tx.loginFailure.findUnique({
        where: { identifierHash_sourceHash: { identifierHash, sourceHash } },
      });
      const count =
        old && now.getTime() - old.lastFailedAt.getTime() < DAY
          ? old.count + 1
          : 1;
      const data = {
        count,
        lastFailedAt: now,
        nextAllowedAt: plusMs(
          now,
          count <= 3 ? 0 : Math.min(2 ** Math.min(count - 3, 5), 30) * 1000,
        ),
      };
      await tx.loginFailure.upsert({
        where: { identifierHash_sourceHash: { identifierHash, sourceHash } },
        create: { identifierHash, sourceHash, ...data },
        update: data,
      });
      if (userId) {
        const risk = await tx.accountLoginRisk.findUnique({
          where: { userId },
        });
        await tx.accountLoginRisk.upsert({
          where: { userId },
          create: { userId, count: 1, lastFailedAt: now },
          update: {
            count:
              risk && now.getTime() - risk.lastFailedAt.getTime() < DAY
                ? risk.count + 1
                : 1,
            lastFailedAt: now,
          },
        });
      }
      const summarized = await this.bucket(
        tx,
        'failed-login:event',
        sourceHash,
        1,
      );
      if (!summarized)
        await tx.securityEvent.create({
          data: {
            type: 'LOGIN_FAILED',
            outcome: 'failure',
            sourceIpHash: sourceHash,
            metadata: { kind: 'source-aggregate' },
            createdAt: now,
          },
        });
    });
  }
  async reserveSend(
    tx: Tx,
    mailbox: string,
    source: string,
    challengeId: string,
  ): Promise<number> {
    const now = this.clock.now(),
      recipientHash = this.hash('identifier', mailbox),
      sourceHash = this.hash('source', source);
    for (const key of [
      `otp-recipient:${recipientHash}`,
      `otp-source:${sourceHash}`,
    ].sort())
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const sends = await tx.otpSendReservation.findMany({
      where: { recipientHash, createdAt: { gt: plusMs(now, -900000) } },
      orderBy: { createdAt: 'desc' },
    });
    const ip = await tx.otpSendReservation.count({
      where: { sourceHash, createdAt: { gt: plusMs(now, -3600000) } },
    });
    if (sends[0] && now.getTime() - sends[0].createdAt.getTime() < 60000)
      return Math.ceil(
        (60000 - now.getTime() + sends[0].createdAt.getTime()) / 1000,
      );
    if (sends.length >= 3)
      return Math.max(
        1,
        Math.ceil(
          (sends[sends.length - 1].createdAt.getTime() +
            900000 -
            now.getTime()) /
            1000,
        ),
      );
    if (ip >= 10) return 3600;
    await tx.otpSendReservation.create({
      data: { recipientHash, sourceHash, challengeId, createdAt: now },
    });
    return 0;
  }
}
