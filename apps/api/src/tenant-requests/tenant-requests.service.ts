import { Injectable } from '@nestjs/common';
import { TenantRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantRequestDto } from './dto/create-tenant-request.dto';
import { IdentifierService } from '../auth/identifier.service';
import { PasswordService } from '../auth/password.service';
import { OtpService } from '../auth/otp.service';
import { AuthCompletionService } from '../auth/auth-completion.service';
import { AuthPolicyService } from '../auth/auth-policy.service';
import { RateLimitsService } from '../auth/security/rate-limits.service';
import { BrowserContext } from '../auth/security/cookies';
import {
  AuthClock,
  authError,
  mailboxLock,
  plusMs,
  serial,
} from '../auth/security/primitives';
import { AnyAccessTokenPayload } from '../auth/token.types';
import { SessionService } from '../auth/session.service';
import { MailerService } from '../mailer/mailer.service';
import { SecurityEventsService } from '../auth/security/security-events.service';
const select = {
  id: true,
  workspaceName: true,
  slug: true,
  description: true,
  requesterName: true,
  requesterEmail: true,
  status: true,
  tenantId: true,
  createdAt: true,
  reviewedAt: true,
  emailVerifiedAt: true,
} as const;
@Injectable()
export class TenantRequestsService {
  constructor(
    private readonly db: PrismaService,
    private readonly identifiers: IdentifierService,
    private readonly passwords: PasswordService,
    private readonly otp: OtpService,
    private readonly completion: AuthCompletionService,
    private readonly policy: AuthPolicyService,
    private readonly rates: RateLimitsService,
    private readonly clock: AuthClock,
    private readonly sessions: SessionService,
    private readonly mail: MailerService,
    private readonly events: SecurityEventsService,
  ) {}
  async create(dto: CreateTenantRequestDto, ctx: BrowserContext) {
    this.policy.enabled();
    await this.rates.publicGate('tenant-request', ctx.source);
    const email = this.identifiers.normalize(dto.requesterEmail),
      hash = await this.passwords.hash(dto.password);
    const c = await serial(this.db, async (tx) => {
      const exists = await tx.user.findUnique({
        where: { emailNormalized: email.normalized },
      });
      if (exists || !this.mail.allowed(email.normalized))
        return this.otp.create(
          tx,
          {
            purpose: 'TENANT_REQUEST',
            principalKind: 'DECOY',
            emailNormalized: email.normalized,
          },
          ctx,
        );
      const slug =
        dto.workspaceName
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'workspace';
      const request = await tx.tenantRequest.create({
        data: {
          workspaceName: dto.workspaceName.trim(),
          slug,
          description: dto.description?.trim(),
          requesterName: dto.requesterName.trim(),
          requesterEmail: email.raw,
          emailNormalized: email.normalized,
          passwordHash: hash,
          contextHash: ctx.contextHash,
          expiresAt: plusMs(this.clock.now(), 600000),
        },
      });
      return this.otp.create(
        tx,
        {
          purpose: 'TENANT_REQUEST',
          principalKind: 'TENANT_REQUEST',
          tenantRequestId: request.id,
          emailNormalized: email.normalized,
          expiresAt: request.expiresAt,
        },
        ctx,
      );
    });
    return this.otp.present(c, ctx, true);
  }
  async verify(challengeId: string, code: string, ctx: BrowserContext) {
    const r = await this.otp.verify(
      challengeId,
      code,
      ['TENANT_REQUEST'],
      ctx,
      undefined,
      (tx, c) => this.completion.finish(tx, c, ctx, false),
    );
    return r.result;
  }
  list(status?: TenantRequestStatus) {
    return this.db.tenantRequest.findMany({
      where: {
        emailVerifiedAt: { not: null },
        expiresAt: { gt: this.clock.now() },
        ...(status ? { status } : {}),
      },
      select,
      orderBy: { createdAt: 'asc' },
    });
  }
  async approve(id: string, actor: AnyAccessTokenPayload) {
    return serial(this.db, async (tx) => {
      const s = await this.sessions.live(tx, actor);
      if (actor.type !== 'superadmin' || !s.user.isSuperAdmin)
        throw authError('FORBIDDEN', 403);
      const r = await tx.tenantRequest.findUnique({ where: { id } });
      if (
        !r ||
        r.status !== 'PENDING' ||
        !r.emailVerifiedAt ||
        r.expiresAt <= this.clock.now() ||
        !r.passwordHash
      )
        throw authError('REQUEST_UNAVAILABLE', 409);
      await mailboxLock(tx, r.emailNormalized);
      let user = await tx.user.findUnique({
        where: { emailNormalized: r.emailNormalized },
      });
      if (user && (!user.emailVerifiedAt || user.isSuspended))
        throw authError('REQUEST_ACCOUNT_CONFLICT', 409);
      if (await tx.tenant.findUnique({ where: { slug: r.slug } }))
        throw authError('WORKSPACE_NAME_UNAVAILABLE', 409);
      const tenant = await tx.tenant.create({
        data: {
          name: r.workspaceName,
          slug: r.slug,
          description: r.description,
        },
      });
      if (!user) {
        user = await tx.user.create({
          data: {
            email: r.requesterEmail,
            emailNormalized: r.emailNormalized,
            name: r.requesterName,
            passwordHash: r.passwordHash,
            emailVerifiedAt: null,
          },
        });
        await tx.authIdentity.create({
          data: {
            userId: user.id,
            provider: 'PASSWORD',
            providerUserId: user.id,
          },
        });
      }
      await tx.membership.create({
        data: { userId: user.id, tenantId: tenant.id, role: 'ADMIN' },
      });
      await tx.authChallenge.updateMany({
        where: {
          tenantRequestId: id,
          state: { in: ['READY', 'FAILED', 'PENDING_SEND'] },
        },
        data: { state: 'CANCELLED' },
      });
      const updated = await tx.tenantRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          tenantId: tenant.id,
          reviewedAt: this.clock.now(),
          passwordHash: null,
        },
        select,
      });
      await this.events.record(
        tx,
        'TENANT_REQUEST_APPROVED',
        actor.sub,
        actor.sessionId,
        { tenantRequestId: id, tenantId: tenant.id },
      );
      await this.mail.queue(
        tx,
        r.emailNormalized,
        'SECURITY',
        'Your workspace request was approved. Sign in and verify your email to continue.',
      );
      return updated;
    });
  }
  async reject(id: string, actor: AnyAccessTokenPayload) {
    return serial(this.db, async (tx) => {
      const s = await this.sessions.live(tx, actor);
      if (actor.type !== 'superadmin' || !s.user.isSuperAdmin)
        throw authError('FORBIDDEN', 403);
      const r = await tx.tenantRequest.findUnique({ where: { id } });
      if (!r || r.status !== 'PENDING' || !r.emailVerifiedAt)
        throw authError('REQUEST_UNAVAILABLE', 409);
      await tx.authChallenge.updateMany({
        where: {
          tenantRequestId: id,
          state: { in: ['READY', 'FAILED', 'PENDING_SEND'] },
        },
        data: { state: 'CANCELLED' },
      });
      await this.events.record(
        tx,
        'TENANT_REQUEST_REJECTED',
        actor.sub,
        actor.sessionId,
        { tenantRequestId: id },
      );
      return tx.tenantRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          passwordHash: null,
          reviewedAt: this.clock.now(),
        },
        select,
      });
    });
  }
}
