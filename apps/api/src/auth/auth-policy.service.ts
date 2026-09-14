import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { AuthClock, DAY, Tx, authError, sha256 } from './security/primitives';
import { MailerService } from '../mailer/mailer.service';
@Injectable()
export class AuthPolicyService {
  constructor(
    private readonly config: ConfigService,
    private readonly clock: AuthClock,
    private readonly mail: MailerService,
  ) {}
  enabled(email?: string) {
    if (
      this.config.get('AUTH_OTP_MODE') === 'off' ||
      (email && !this.mail.allowed(email))
    )
      throw authError('AUTH_UNAVAILABLE', 503);
  }
  googleEnabled() {
    this.enabled();
    if (this.config.get('AUTH_GOOGLE_ENABLED') !== 'true')
      throw authError('AUTH_UNAVAILABLE', 503);
  }
  async reasons(
    tx: Tx,
    user: User,
    deviceToken?: string,
    googleInsufficient = false,
  ) {
    this.enabled(user.emailNormalized);
    const reasons: string[] = [];
    if (!user.emailVerifiedAt) reasons.push('UNVERIFIED');
    if (googleInsufficient) reasons.push('GOOGLE_MAILBOX');
    const risk = await tx.accountLoginRisk.findUnique({
      where: { userId: user.id },
    });
    if (
      risk &&
      risk.count >= 5 &&
      this.clock.now().getTime() - risk.lastFailedAt.getTime() < DAY
    )
      reasons.push('RISK');
    if (user.isSuperAdmin) reasons.push('SUPERADMIN');
    else {
      const device = deviceToken
        ? await tx.trustedDevice.findUnique({
            where: { tokenHash: sha256(deviceToken) },
          })
        : null;
      const trusted =
        device &&
        device.userId === user.id &&
        !device.revokedAt &&
        device.expiresAt > this.clock.now() &&
        device.absoluteExpiresAt > this.clock.now();
      if (!trusted && this.config.get('AUTH_OTP_MODE') === 'all')
        reasons.push('NEW_DEVICE');
    }
    return reasons;
  }
}
