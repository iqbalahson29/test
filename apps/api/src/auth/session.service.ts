import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  IdentityProvider,
  Prisma,
  Session,
  SessionContext,
  User,
  TrustedDevice,
} from '@prisma/client';
import type { SessionResult } from '@quiz-platform/shared';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { PrismaService } from '../prisma/prisma.service';
import { SESSION_LOCK_TIMEOUT_MS } from '../common/session-lock.constants';
import { AnyAccessTokenPayload, AnyRefreshTokenPayload } from './token.types';
import {
  AuthClock,
  AuthRandom,
  DAY,
  Tx,
  authError,
  plusMs,
  serial,
  sha256,
} from './security/primitives';
import { AuthCookies, BrowserContext } from './security/cookies';
import { SecurityEventsService } from './security/security-events.service';
import { RateLimitsService } from './security/rate-limits.service';
const include = {
  user: true,
  membership: { include: { tenant: true } },
} satisfies Prisma.SessionInclude;
type LiveSession = Prisma.SessionGetPayload<{ include: typeof include }>;
export interface SessionOutput {
  result: SessionResult;
  refreshToken?: string;
  refreshExpiresAt?: Date;
  contextToken?: string;
  deviceToken?: string;
  deviceExpiresAt?: Date;
  clearDevice?: boolean;
}
export interface FactorFacts {
  firstFactor: IdentityProvider;
  firstFactorAt: Date;
  otpVerifiedAt?: Date | null;
}
@Injectable()
export class SessionService {
  constructor(
    private readonly db: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly clock: AuthClock,
    private readonly random: AuthRandom,
    private readonly cookies: AuthCookies,
    private readonly events: SecurityEventsService,
    private readonly rates: RateLimitsService,
  ) {}
  summary(m: {
    id: string;
    tenantId: string;
    role: 'ADMIN' | 'STUDENT';
    tenant: { name: string };
  }) {
    return {
      membershipId: m.id,
      tenantId: m.tenantId,
      tenantName: m.tenant.name,
      role: m.role,
    };
  }
  async memberships(tx: Tx, userId: string) {
    return tx.membership.findMany({
      where: { userId, tenant: { status: 'ACTIVE' } },
      include: { tenant: true },
      orderBy: { createdAt: 'asc' },
    });
  }
  claims(
    payload: unknown,
    refresh = false,
  ): payload is AnyAccessTokenPayload | AnyRefreshTokenPayload {
    if (!payload || typeof payload !== 'object') return false;
    const p = payload as Record<string, unknown>;
    return (
      (refresh
        ? ['refresh', 'account-refresh', 'superadmin-refresh']
        : ['access', 'account', 'superadmin']
      ).includes(String(p.type)) &&
      ['sub', 'sessionId', 'jti'].every(
        (k) =>
          typeof p[k] === 'string' && p[k].length > 0 && p[k].length <= 128,
      ) &&
      /^[0-9a-f-]{36}$/i.test(String(p.sessionId)) &&
      [
        'tokenVersion',
        'contextVersion',
        'refreshGeneration',
        'iat',
        'exp',
      ].every((k) => Number.isSafeInteger(p[k]) && Number(p[k]) >= 0) &&
      p.iss === 'quiz-platform' &&
      p.aud === (refresh ? 'quiz-platform-refresh' : 'quiz-platform-api') &&
      Number(p.exp) > Math.floor(this.clock.now().getTime() / 1000) &&
      Number(p.iat) <= Math.floor(this.clock.now().getTime() / 1000) + 60 &&
      (!(p.type === 'access' || p.type === 'refresh') ||
        typeof p.membershipId === 'string') &&
      (p.type !== 'access' ||
        (typeof p.tenantId === 'string' &&
          ['ADMIN', 'STUDENT'].includes(String(p.role))))
    );
  }
  private baseValid(
    s: LiveSession | null,
    p: AnyAccessTokenPayload | AnyRefreshTokenPayload,
  ) {
    const now = this.clock.now();
    return (
      s &&
      s.userId === p.sub &&
      !s.revokedAt &&
      !s.user.isSuspended &&
      s.idleExpiresAt > now &&
      s.absoluteExpiresAt > now &&
      s.tokenVersion === p.tokenVersion &&
      s.user.tokenVersion === p.tokenVersion
    );
  }
  private contextValid(
    s: LiveSession,
    p: AnyAccessTokenPayload | AnyRefreshTokenPayload,
  ) {
    if (s.contextVersion !== p.contextVersion) return false;
    if (s.context === 'MEMBERSHIP')
      return (
        (p.type === 'access' || p.type === 'refresh') &&
        p.membershipId === s.membershipId &&
        !!s.membership &&
        s.membership.userId === s.userId &&
        s.membership.tenant.status === 'ACTIVE' &&
        (p.type !== 'access' ||
          (p.role === s.membership.role &&
            p.tenantId === s.membership.tenantId))
      );
    if (s.context === 'SUPERADMIN')
      return (
        s.user.isSuperAdmin &&
        (p.type === 'superadmin' || p.type === 'superadmin-refresh')
      );
    return (
      s.context === 'ACCOUNT' &&
      (p.type === 'account' || p.type === 'account-refresh')
    );
  }
  async live(tx: Tx, p: AnyAccessTokenPayload): Promise<LiveSession> {
    if (!this.claims(p)) throw authError('SESSION_INVALID', 401);
    const s = await tx.session.findUnique({
      where: { id: p.sessionId },
      include,
    });
    if (!this.baseValid(s, p) || !s || !this.contextValid(s, p))
      throw authError('SESSION_INVALID', 401);
    return s;
  }
  async validateAccess(payload: unknown) {
    if (!this.claims(payload)) throw authError('SESSION_INVALID', 401);
    try {
      await this.live(this.db, payload as AnyAccessTokenPayload);
      return payload as AnyAccessTokenPayload;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError ||
        e instanceof Prisma.PrismaClientInitializationError
      )
        throw authError('AUTH_RETRY_LATER', 503);
      throw e;
    }
  }
  readRefresh(raw?: string): AnyRefreshTokenPayload | null {
    if (!raw) return null;
    try {
      const p: unknown = this.jwt.verify(raw, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        algorithms: ['HS256'],
        issuer: 'quiz-platform',
        audience: 'quiz-platform-refresh',
        clockTimestamp: Math.floor(this.clock.now().getTime() / 1000),
      });
      return this.claims(p, true) ? (p as AnyRefreshTokenPayload) : null;
    } catch {
      return null;
    }
  }
  readLogoutAccess(raw?: string): AnyAccessTokenPayload | null {
    if (!raw) return null;
    try {
      const p = this.jwt.verify<AnyAccessTokenPayload>(raw, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        algorithms: ['HS256'],
        issuer: 'quiz-platform',
        audience: 'quiz-platform-api',
        ignoreExpiration: true,
      });
      return this.claims({
        ...p,
        exp: Math.floor(this.clock.now().getTime() / 1000) + 1,
      })
        ? p
        : null;
    } catch {
      return null;
    }
  }
  async revoke(tx: Tx, id: string, reason: string) {
    const now = this.clock.now();
    const changed = await tx.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
    await tx.authChallenge.updateMany({
      where: {
        sessionId: id,
        state: { in: ['READY', 'PENDING_SEND', 'FAILED'] },
      },
      data: { state: 'CANCELLED', failureReason: reason },
    });
    await tx.authGrant.updateMany({
      where: { sessionId: id, consumedAt: null },
      data: { consumedAt: now },
    });
    await tx.workspaceSelection.updateMany({
      where: { sessionId: id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (changed.count) {
      const s = await tx.session.findUniqueOrThrow({ where: { id } });
      await this.events.record(tx, 'SESSION_REVOKED', s.userId, id, { reason });
    }
  }
  async invalidateUser(
    tx: Tx,
    userId: string,
    reason: string,
    keepSession?: string,
  ) {
    const now = this.clock.now();
    const sessions = await tx.session.findMany({
      where: {
        userId,
        revokedAt: null,
        ...(keepSession ? { id: { not: keepSession } } : {}),
      },
      select: { id: true },
    });
    for (const s of sessions) await this.revoke(tx, s.id, reason);
    await tx.trustedDevice.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.authChallenge.updateMany({
      where: { userId, state: { in: ['PENDING_SEND', 'READY', 'FAILED'] } },
      data: { state: 'CANCELLED', failureReason: reason },
    });
    await tx.authGrant.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: now },
    });
    await tx.googleNonce.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: now },
    });
    await tx.pendingGoogleLink.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: now },
    });
    await tx.pendingEmailChange.updateMany({
      where: { userId, completedAt: null, invalidatedAt: null },
      data: { invalidatedAt: now },
    });
  }
  async examLocks(
    tx: Tx,
    sessionId: string,
    membershipId?: string,
    switching = false,
  ) {
    const cutoff = plusMs(this.clock.now(), -SESSION_LOCK_TIMEOUT_MS);
    const where = {
      status: 'IN_PROGRESS' as const,
      lastHeartbeatAt: { gt: cutoff },
      ...(switching
        ? { lockSessionId: sessionId }
        : {
            studentMembershipId: membershipId,
            lockSessionId: { not: sessionId },
          }),
    };
    const [regular, practice] = await Promise.all([
      tx.attempt.findFirst({ where, select: { id: true } }),
      tx.practiceAttempt.findFirst({ where, select: { id: true } }),
    ]);
    if (regular || practice) throw authError('ACTIVE_TEST_SESSION', 409);
  }
  async create(
    tx: Tx,
    user: User,
    ctx: BrowserContext,
    facts: FactorFacts,
  ): Promise<SessionOutput> {
    if (user.isSuspended) throw authError('SESSION_INVALID', 401);
    const now = this.clock.now(),
      memberships = await this.memberships(tx, user.id),
      contextToken = this.random.token();
    const context: SessionContext = user.isSuperAdmin
      ? 'SUPERADMIN'
      : memberships.length === 1
        ? 'MEMBERSHIP'
        : memberships.length > 1
          ? 'PICKER'
          : 'ACCOUNT';
    const id = randomUUID();
    if (context === 'MEMBERSHIP')
      await this.examLocks(tx, id, memberships[0].id);
    const s = await tx.session.create({
      data: {
        id,
        userId: user.id,
        membershipId: context === 'MEMBERSHIP' ? memberships[0].id : null,
        context,
        tokenVersion: user.tokenVersion,
        authMethods: [
          facts.firstFactor,
          ...(facts.otpVerifiedAt ? ['EMAIL_OTP'] : []),
        ],
        firstFactorAt: facts.firstFactorAt,
        otpVerifiedAt: facts.otpVerifiedAt,
        lastUsedAt: now,
        idleExpiresAt: plusMs(now, 7 * DAY),
        absoluteExpiresAt: plusMs(now, 30 * DAY),
        userAgent: ctx.userAgent.slice(0, 512),
        ip: isIP(ctx.source) ? ctx.source : null,
      },
    });
    const prior = this.readRefresh(ctx.refreshToken);
    if (prior) {
      const use = await tx.refreshTokenUse.findUnique({
        where: { tokenHash: sha256(ctx.refreshToken!) },
      });
      if (use?.sessionId === prior.sessionId)
        await this.revoke(tx, prior.sessionId, 'account-replaced');
    }
    await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
    });
    await tx.accountLoginRisk.deleteMany({ where: { userId: user.id } });
    await tx.loginFailure.deleteMany({
      where: {
        identifierHash: this.rates.hash('identifier', user.emailNormalized),
        sourceHash: this.rates.hash('source', ctx.source),
      },
    });
    await this.events.record(tx, 'LOGIN_SUCCEEDED', user.id, id, {
      provider: facts.firstFactor,
    });
    if (context === 'PICKER') {
      const token = this.random.token();
      await tx.workspaceSelection.create({
        data: {
          tokenHash: sha256(token),
          sessionId: id,
          contextHash: this.cookies.hash(contextToken),
          tokenVersion: user.tokenVersion,
          expiresAt: plusMs(now, 300000),
        },
      });
      return {
        result: {
          status: 'choose-workspace',
          selectionToken: token,
          choices: memberships.map((m) => this.summary(m)),
        },
        contextToken,
      };
    }
    return { ...(await this.issue(tx, s)), contextToken };
  }
  async issue(tx: Tx, session: Session): Promise<SessionOutput> {
    const now = this.clock.now(),
      s = await tx.session.findUniqueOrThrow({
        where: { id: session.id },
        include,
      });
    if (s.context === 'PICKER' || s.revokedAt || s.user.isSuspended)
      throw authError('SESSION_INVALID', 401);
    const generation = s.refreshGeneration + 1;
    const exp = Math.floor(
      Math.min(now.getTime() + 7 * DAY, s.absoluteExpiresAt.getTime()) / 1000,
    );
    if (exp <= Math.floor(now.getTime() / 1000))
      throw authError('SESSION_INVALID', 401);
    if (s.currentRefreshHash)
      await tx.refreshTokenUse.updateMany({
        where: {
          sessionId: s.id,
          tokenHash: s.currentRefreshHash,
          consumedAt: null,
        },
        data: { consumedAt: now, graceUntil: plusMs(now, 10000) },
      });
    const base = {
      sub: s.userId,
      sessionId: s.id,
      tokenVersion: s.tokenVersion,
      contextVersion: s.contextVersion,
      refreshGeneration: generation,
      iat: Math.floor(now.getTime() / 1000),
    };
    const type =
      s.context === 'MEMBERSHIP'
        ? 'access'
        : s.context === 'SUPERADMIN'
          ? 'superadmin'
          : 'account';
    const refreshType = type === 'access' ? 'refresh' : `${type}-refresh`;
    const member = s.membership;
    if (type === 'access' && (!member || member.tenant.status !== 'ACTIVE'))
      throw authError('SESSION_INVALID', 401);
    const memberClaims =
      type === 'access'
        ? {
            membershipId: member!.id,
            tenantId: member!.tenantId,
            role: member!.role,
          }
        : {};
    const jti = randomUUID();
    const accessToken = this.jwt.sign(
      {
        ...base,
        ...memberClaims,
        type,
        exp: Math.floor(now.getTime() / 1000) + 600,
        jti: randomUUID(),
      },
      {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        algorithm: 'HS256',
        issuer: 'quiz-platform',
        audience: 'quiz-platform-api',
      },
    );
    const refreshToken = this.jwt.sign(
      {
        ...base,
        ...(member ? { membershipId: member.id } : {}),
        type: refreshType,
        exp,
        jti,
      },
      {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        algorithm: 'HS256',
        issuer: 'quiz-platform',
        audience: 'quiz-platform-refresh',
      },
    );
    const refreshExpiresAt = new Date(exp * 1000);
    await tx.refreshTokenUse.create({
      data: {
        sessionId: s.id,
        jti,
        tokenHash: sha256(refreshToken),
        issuedAt: now,
        jwtExpiresAt: refreshExpiresAt,
      },
    });
    await tx.session.update({
      where: { id: s.id },
      data: {
        currentRefreshHash: sha256(refreshToken),
        currentRefreshJti: jti,
        refreshGeneration: generation,
        lastUsedAt: now,
        idleExpiresAt: refreshExpiresAt,
      },
    });
    return {
      result:
        type === 'access'
          ? { status: 'ok', accessToken, membership: this.summary(member!) }
          : {
              status: type === 'superadmin' ? 'superadmin' : 'no-workspace',
              accessToken,
            },
      refreshToken,
      refreshExpiresAt,
    };
  }
  async refresh(raw: string, source: string): Promise<SessionOutput> {
    const p = this.readRefresh(raw);
    if (!p) throw authError('SESSION_INVALID', 401);
    await this.rates.sessionGate('refresh', p.sessionId, source, 30);
    const outcome = await serial(this.db, async (tx) => {
      const s = await tx.session.findUnique({
        where: { id: p.sessionId },
        include,
      });
      if (!s || !this.baseValid(s, p))
        return { error: 'SESSION_INVALID' } as const;
      const use = await tx.refreshTokenUse.findUnique({
        where: { tokenHash: sha256(raw) },
      });
      if (!use || use.jti !== p.jti || use.sessionId !== s.id)
        return { error: 'SESSION_INVALID' } as const;
      if (use.consumedAt) {
        if (use.graceUntil && this.clock.now() < use.graceUntil)
          return { error: 'REFRESH_RACE' } as const;
        await this.revoke(tx, s.id, 'refresh-reuse');
        await this.events.record(
          tx,
          'REFRESH_REUSE',
          s.userId,
          s.id,
          {},
          'failure',
        );
        return { error: 'SESSION_INVALID' } as const;
      }
      if (
        s.currentRefreshHash !== use.tokenHash ||
        !this.contextValid(s, p) ||
        s.refreshGeneration !== p.refreshGeneration
      )
        return { error: 'SESSION_INVALID' } as const;
      if (s.context === 'ACCOUNT') {
        const memberships = await this.memberships(tx, s.userId);
        if (memberships.length === 1) {
          await this.examLocks(tx, s.id, memberships[0].id);
          await tx.session.update({
            where: { id: s.id },
            data: {
              context: 'MEMBERSHIP',
              membershipId: memberships[0].id,
              contextVersion: { increment: 1 },
            },
          });
        }
      }
      return { output: await this.issue(tx, s) };
    });
    if ('error' in outcome)
      throw authError(
        outcome.error!,
        outcome.error === 'REFRESH_RACE' ? 409 : 401,
        outcome.error === 'REFRESH_RACE' ? 1 : undefined,
      );
    return outcome.output;
  }
  async select(token: string, membershipId: string, ctx: BrowserContext) {
    return serial(this.db, async (tx) => {
      const selector = await tx.workspaceSelection.findUnique({
        where: { tokenHash: sha256(token) },
        include: { session: { include } },
      });
      if (
        !selector ||
        selector.consumedAt ||
        selector.contextHash !== ctx.contextHash ||
        selector.expiresAt <= this.clock.now()
      )
        throw authError('CHALLENGE_INVALID');
      const s = selector.session;
      if (
        s.revokedAt ||
        s.context !== 'PICKER' ||
        s.user.isSuspended ||
        s.user.tokenVersion !== selector.tokenVersion
      )
        throw authError('SESSION_INVALID', 401);
      const member = await tx.membership.findUnique({
        where: { id: membershipId },
        include: { tenant: true },
      });
      if (
        !member ||
        member.userId !== s.userId ||
        member.tenant.status !== 'ACTIVE'
      )
        throw authError('SESSION_INVALID', 401);
      await this.examLocks(tx, s.id, member.id);
      await tx.workspaceSelection.update({
        where: { id: selector.id },
        data: { consumedAt: this.clock.now() },
      });
      const changed = await tx.session.update({
        where: { id: s.id },
        data: {
          context: 'MEMBERSHIP',
          membershipId: member.id,
          contextVersion: { increment: 1 },
        },
      });
      return this.issue(tx, changed);
    });
  }
  async switch(
    actor: AnyAccessTokenPayload,
    raw: string | undefined,
    target: { membershipId?: string; tenantId?: string; exit?: boolean },
  ) {
    const p = this.readRefresh(raw);
    if (!p || p.sessionId !== actor.sessionId)
      throw authError('AUTH_CONTEXT_CHANGED', 409);
    return serial(this.db, async (tx) => {
      const s = await this.live(tx, actor);
      if (s.currentRefreshHash !== sha256(raw!))
        throw authError('REFRESH_RACE', 409, 1);
      await this.examLocks(tx, s.id, undefined, true);
      let membershipId = target.membershipId;
      if (target.tenantId || target.exit) {
        if (!s.user.isSuperAdmin) throw authError('FORBIDDEN', 403);
      }
      if (target.tenantId) {
        const tenant = await tx.tenant.findUnique({
          where: { id: target.tenantId },
        });
        if (!tenant || tenant.status !== 'ACTIVE')
          throw authError('FORBIDDEN', 403);
        const m = await tx.membership.upsert({
          where: { userId_tenantId: { userId: s.userId, tenantId: tenant.id } },
          create: { userId: s.userId, tenantId: tenant.id, role: 'ADMIN' },
          update: { role: 'ADMIN' },
        });
        membershipId = m.id;
      }
      if (!target.exit) {
        const member = membershipId
          ? await tx.membership.findUnique({
              where: { id: membershipId },
              include: { tenant: true },
            })
          : null;
        if (
          !member ||
          member.userId !== s.userId ||
          member.tenant.status !== 'ACTIVE'
        )
          throw authError('FORBIDDEN', 403);
        await this.examLocks(tx, s.id, member.id);
      }
      const changed = await tx.session.update({
        where: { id: s.id },
        data: {
          context: target.exit ? 'SUPERADMIN' : 'MEMBERSHIP',
          membershipId: target.exit ? null : membershipId,
          contextVersion: { increment: 1 },
        },
      });
      await this.events.record(tx, 'SESSION_CONTEXT_CHANGED', s.userId, s.id, {
        ...(membershipId ? { membershipId } : {}),
      });
      return this.issue(tx, changed);
    });
  }
  async logout(
    raw: string | undefined,
    actor: AnyAccessTokenPayload | null,
    forgetDevice?: string,
  ) {
    const p = this.readRefresh(raw);
    if (p && actor && p.sessionId !== actor.sessionId)
      throw authError('AUTH_CONTEXT_CHANGED', 409);
    await serial(this.db, async (tx) => {
      let id = actor?.sessionId;
      if (p) {
        const use = await tx.refreshTokenUse.findUnique({
          where: { tokenHash: sha256(raw!) },
        });
        if (use?.sessionId === p.sessionId) id = p.sessionId;
      }
      if (id) await this.revoke(tx, id, 'logout');
      if (forgetDevice)
        await tx.trustedDevice.updateMany({
          where: { tokenHash: sha256(forgetDevice) },
          data: { revokedAt: this.clock.now() },
        });
    });
  }
  async list(
    actor: AnyAccessTokenPayload,
    kind: 'sessions' | 'devices',
    deviceToken?: string,
    cursor?: string,
    limit = 20,
  ) {
    await this.live(this.db, actor);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw authError('VALIDATION_ERROR');
    let page: { lastUsedAt: string; id: string; userId: string } | undefined;
    if (cursor) {
      try {
        page = JSON.parse(
          Buffer.from(cursor, 'base64url').toString(),
        ) as typeof page;
        if (
          !page ||
          page.userId !== actor.sub ||
          !page.id ||
          !Number.isFinite(Date.parse(page.lastUsedAt))
        )
          throw new Error();
      } catch {
        throw authError('VALIDATION_ERROR');
      }
    }
    const now = this.clock.now(),
      after = page
        ? {
            OR: [
              { lastUsedAt: { lt: new Date(page.lastUsedAt) } },
              { lastUsedAt: new Date(page.lastUsedAt), id: { lt: page.id } },
            ],
          }
        : {};
    const orderBy = [{ lastUsedAt: 'desc' as const }, { id: 'desc' as const }];
    const rows: (
      | Prisma.SessionGetPayload<{
          include: { membership: { include: { tenant: true } } };
        }>
      | TrustedDevice
    )[] =
      kind === 'sessions'
        ? await this.db.session.findMany({
            where: {
              userId: actor.sub,
              revokedAt: null,
              context: { not: 'PICKER' },
              idleExpiresAt: { gt: now },
              absoluteExpiresAt: { gt: now },
              ...after,
            },
            orderBy,
            take: limit + 1,
            include: { membership: { include: { tenant: true } } },
          })
        : await this.db.trustedDevice.findMany({
            where: {
              userId: actor.sub,
              revokedAt: null,
              expiresAt: { gt: now },
              absoluteExpiresAt: { gt: now },
              ...after,
            },
            orderBy,
            take: limit + 1,
          });
    const last = rows[limit - 1];
    const items = rows.slice(0, limit).map((row) => {
      if ('context' in row)
        return {
          id: row.id,
          current: row.id === actor.sessionId,
          context: row.context,
          membership: row.membership ? this.summary(row.membership) : null,
          label: this.label(row.userAgent),
          ip: row.ip,
          createdAt: row.createdAt,
          lastUsedAt: row.lastUsedAt,
          idleExpiresAt: row.idleExpiresAt,
          absoluteExpiresAt: row.absoluteExpiresAt,
        };
      return {
        id: row.id,
        current: !!deviceToken && row.tokenHash === sha256(deviceToken),
        label: row.label ?? 'Unknown browser',
        lastIp: row.lastIp,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
        expiresAt: row.expiresAt,
        absoluteExpiresAt: row.absoluteExpiresAt,
      };
    });
    return {
      items,
      nextCursor:
        rows.length > limit
          ? Buffer.from(
              JSON.stringify({
                lastUsedAt: last.lastUsedAt.toISOString(),
                id: last.id,
                userId: actor.sub,
              }),
            ).toString('base64url')
          : null,
    };
  }
  label(ua: string | null) {
    if (!ua) return 'Unknown browser';
    const browser = /Firefox/i.test(ua)
      ? 'Firefox'
      : /Edg\//.test(ua)
        ? 'Edge'
        : /Chrome/.test(ua)
          ? 'Chrome'
          : /Safari/.test(ua)
            ? 'Safari'
            : 'Unknown browser';
    const platform = /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : '';
    return `${browser}${platform ? ' on ' + platform : ''}`;
  }
  async remove(
    actor: AnyAccessTokenPayload,
    kind: 'sessions' | 'devices',
    id: string,
    device?: string,
  ) {
    return serial(this.db, async (tx) => {
      await this.live(tx, actor);
      const row =
        kind === 'sessions'
          ? await tx.session.findUnique({ where: { id } })
          : await tx.trustedDevice.findUnique({ where: { id } });
      if (!row) return false;
      if (row.userId !== actor.sub) throw authError('NOT_FOUND', 404);
      if (kind === 'sessions') {
        await this.revoke(tx, id, 'user-revoked');
        return id === actor.sessionId;
      }
      await tx.trustedDevice.update({
        where: { id },
        data: { revokedAt: this.clock.now() },
      });
      await this.events.record(
        tx,
        'DEVICE_REVOKED',
        actor.sub,
        actor.sessionId,
        { deviceId: id },
      );
      return 'tokenHash' in row && !!device && row.tokenHash === sha256(device);
    });
  }
}
