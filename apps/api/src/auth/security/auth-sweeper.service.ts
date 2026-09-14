import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthClock, DAY, plusMs, serial } from './primitives';
import { SessionService } from '../session.service';
import { MailerService } from '../../mailer/mailer.service';
@Injectable()
export class AuthSweeperService {
  private readonly logger = new Logger(AuthSweeperService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly clock: AuthClock,
    private readonly sessions: SessionService,
    private readonly mail: MailerService,
  ) {}
  @Interval(3600000)
  async sweep() {
    const owner = randomUUID(),
      now = this.clock.now();
    try {
      const claimed = await serial(this.db, async (tx) => {
        const old = await tx.authJobLease.findUnique({
          where: { name: 'auth-sweeper' },
        });
        if (old && old.expiresAt > now) return false;
        await tx.authJobLease.upsert({
          where: { name: 'auth-sweeper' },
          create: {
            name: 'auth-sweeper',
            owner,
            expiresAt: plusMs(now, 30000),
          },
          update: { owner, expiresAt: plusMs(now, 30000) },
        });
        return true;
      });
      if (!claimed) return;
      const leaseEnd = now.getTime() + 30000;
      await serial(this.db, async (tx) => {
        const pickers = await tx.workspaceSelection.findMany({
          where: { consumedAt: null, expiresAt: { lte: now } },
          take: 500,
        });
        for (const p of pickers)
          await this.sessions.revoke(tx, p.sessionId, 'picker-expired');
        const sessions = await tx.session.findMany({
          where: {
            revokedAt: null,
            OR: [
              { idleExpiresAt: { lte: now } },
              { absoluteExpiresAt: { lte: now } },
            ],
          },
          take: 500,
        });
        for (const s of sessions)
          await this.sessions.revoke(tx, s.id, 'session-expired');
        const requests = await tx.tenantRequest.findMany({
          where: { status: 'PENDING', expiresAt: { lte: now } },
          take: 500,
        });
        for (const r of requests) {
          await tx.tenantRequest.update({
            where: { id: r.id },
            data: { status: 'REJECTED', passwordHash: null, reviewedAt: now },
          });
          await tx.authChallenge.updateMany({
            where: {
              tenantRequestId: r.id,
              state: { in: ['READY', 'FAILED', 'PENDING_SEND'] },
            },
            data: { state: 'EXPIRED' },
          });
          if (r.emailVerifiedAt)
            await this.mail.queue(
              tx,
              r.emailNormalized,
              'SECURITY',
              'Your workspace request expired. You may submit a new request.',
            );
        }
        const invitations = await tx.memberInvitation.findMany({
          where: { status: 'PENDING', expiresAt: { lte: now } },
          take: 500,
        });
        for (const i of invitations) {
          await tx.memberInvitation.update({
            where: { id: i.id },
            data: { status: 'EXPIRED' },
          });
          await this.mail.cancelInvite(tx, i.id);
        }
      });
      // Static table allowlist; each statement removes at most 500 rows and checks the lease deadline.
      const jobs: [string, string, string, Date][] = [
        ['GoogleNonce', 'id', 'expiresAt', plusMs(now, -DAY)],
        ['AuthGrant', 'id', 'expiresAt', plusMs(now, -DAY)],
        ['EmailOtp', 'id', 'expiresAt', plusMs(now, -DAY)],
        ['PendingGoogleLink', 'id', 'expiresAt', plusMs(now, -DAY)],
        ['PendingEmailChange', 'id', 'expiresAt', plusMs(now, -DAY)],
        ['AuthChallenge', 'id', 'expiresAt', plusMs(now, -DAY)],
        ['PendingRegistration', 'id', 'expiresAt', plusMs(now, -DAY)],
        ['RefreshTokenUse', 'id', 'jwtExpiresAt', plusMs(now, -DAY)],
        ['WorkspaceSelection', 'id', 'expiresAt', plusMs(now, -DAY)],
        ['Session', 'id', 'revokedAt', plusMs(now, -30 * DAY)],
        ['TrustedDevice', 'id', 'expiresAt', plusMs(now, -30 * DAY)],
        ['TrustedDevice', 'id', 'revokedAt', plusMs(now, -30 * DAY)],
        ['OtpSendReservation', 'id', 'createdAt', plusMs(now, -2 * DAY)],
        ['AuthRateBucket', 'keyHash', 'expiresAt', plusMs(now, -2 * DAY)],
        [
          'LoginFailure',
          'identifierHash',
          'lastFailedAt',
          plusMs(now, -2 * DAY),
        ],
        ['AccountLoginRisk', 'userId', 'lastFailedAt', plusMs(now, -2 * DAY)],
        ['MailDeliveryEvent', 'id', 'receivedAt', plusMs(now, -30 * DAY)],
        ['MailDelivery', 'id', 'createdAt', plusMs(now, -30 * DAY)],
        ['MailAttempt', 'id', 'reservedAt', plusMs(now, -30 * DAY)],
        ['MailSendBudget', 'day', 'day', plusMs(now, -30 * DAY)],
        ['MailOutbox', 'id', 'expiresAt', plusMs(now, -30 * DAY)],
        ['CspReport', 'id', 'createdAt', plusMs(now, -7 * DAY)],
        ['SecurityEvent', 'id', 'createdAt', plusMs(now, -180 * DAY)],
        ['OperationalAlert', 'id', 'createdAt', plusMs(now, -180 * DAY)],
      ];
      for (const [table, , column, cutoff] of jobs) {
        if (this.clock.now().getTime() >= leaseEnd) break;
        await this.db.$executeRaw(
          Prisma.sql`DELETE FROM ${Prisma.raw('"' + table + '"')} WHERE ctid IN (SELECT ctid FROM ${Prisma.raw('"' + table + '"')} WHERE ${Prisma.raw('"' + column + '"')} < ${cutoff} LIMIT 500)`,
        );
      }
      const cleared = await this.db.mailRecipient.findMany({
        where: { state: 'OK', lastClearedAt: { lt: plusMs(now, -180 * DAY) } },
        take: 500,
      });
      for (const r of cleared) {
        if (this.clock.now().getTime() >= leaseEnd) break;
        await serial(this.db, async (tx) => {
          const exists = await tx.user.findUnique({
            where: { emailNormalized: r.emailCanonical },
          });
          const pending = await tx.pendingRegistration.findFirst({
            where: {
              emailNormalized: r.emailCanonical,
              completedAt: null,
              expiresAt: { gt: now },
            },
          });
          const changes = await tx.pendingEmailChange.findFirst({
            where: {
              newEmailNormalized: r.emailCanonical,
              completedAt: null,
              invalidatedAt: null,
              expiresAt: { gt: now },
            },
          });
          if (!exists && !pending && !changes)
            await tx.mailRecipient.deleteMany({
              where: {
                emailCanonical: r.emailCanonical,
                state: 'OK',
                lastClearedAt: r.lastClearedAt,
              },
            });
        });
      }
      await this.db.authJobLease.deleteMany({
        where: { name: 'auth-sweeper', owner },
      });
    } catch {
      this.logger.error(
        'Authentication retention sweep failed; validity checks remain enforced',
      );
    }
  }
}
