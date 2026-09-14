import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }

  /**
   * The activation gate for a release, reached only over the loopback port that the host
   * publishes — it is never exposed through the public proxy.
   *
   * `/health` answers `SELECT 1`, which a previous release serving the wrong schema would
   * also answer. Reopening on that alone could not tell that the running container was the
   * intended build, or that the auth tables this release needs actually exist. This reports
   * the release identity it was started with and reads each auth table the login path
   * depends on. It sends no mail and consumes no quota.
   */
  @Get('release')
  async release() {
    const checks: Record<string, boolean> = {};
    try {
      // One read per table the login path touches: a missing or unmigrated table fails here
      // rather than at the first real sign-in.
      await this.prisma.user.findFirst({ select: { id: true } });
      checks.user = true;
      await this.prisma.session.findFirst({ select: { id: true } });
      checks.session = true;
      await this.prisma.authIdentity.findFirst({ select: { id: true } });
      checks.authIdentity = true;
      await this.prisma.authChallenge.findFirst({ select: { id: true } });
      checks.authChallenge = true;
      await this.prisma.emailOtp.findFirst({ select: { id: true } });
      checks.emailOtp = true;
      await this.prisma.authGrant.findFirst({ select: { id: true } });
      checks.authGrant = true;
      await this.prisma.trustedDevice.findFirst({ select: { id: true } });
      checks.trustedDevice = true;
      await this.prisma.authRateBucket.findFirst({ select: { scope: true } });
      checks.authRateBucket = true;
      await this.prisma.mailDelivery.findFirst({ select: { id: true } });
      checks.mailDelivery = true;
      await this.prisma.mailOutbox.findFirst({ select: { id: true } });
      checks.mailOutbox = true;
    } catch {
      // The specific database error is deliberately not echoed to the caller.
      throw new ServiceUnavailableException({
        code: 'AUTH_SCHEMA_UNAVAILABLE',
        message: 'Authentication schema is not ready',
        checks,
      });
    }

    const migrations = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;

    return {
      status: 'ok',
      // The release this container was started as. release.sh compares it with the release
      // it is activating, so a stale container cannot satisfy the gate.
      releaseId: this.config.get<string>('AUTH_RELEASE_ID') ?? null,
      releaseStage: this.config.get<string>('AUTH_RELEASE_STAGE') ?? null,
      otpMode: this.config.get<string>('AUTH_OTP_MODE') ?? null,
      googleEnabled: this.config.get<string>('AUTH_GOOGLE_ENABLED') === 'true',
      googleClientId: this.config.get<string>('GOOGLE_CLIENT_ID') ?? null,
      appliedMigrations: Number(migrations[0]?.count ?? 0),
      checks,
    };
  }
}
