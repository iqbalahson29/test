import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { AttemptStatus, Role, TenantStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { assertPasswordNotReused, pushPasswordHistory } from '../common/password-history';
import { SESSION_LOCK_TIMEOUT_MS } from '../common/session-lock.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  AccessTokenPayload,
  AccountRefreshTokenPayload,
  AccountTokenPayload,
  AnyTokenPayload,
  RefreshTokenPayload,
  SuperAdminRefreshTokenPayload,
  SuperAdminTokenPayload,
  WorkspaceSelectionTokenPayload,
} from './token.types';

export interface MembershipSummary {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  role: import('@prisma/client').Role;
}

type MembershipWithTenant = import('@prisma/client').Membership & {
  tenant: import('@prisma/client').Tenant;
};

export type LoginResult =
  | {
      status: 'ok';
      accessToken: string;
      refreshToken: string;
      membership: MembershipSummary;
    }
  | {
      status: 'superadmin';
      accessToken: string;
      refreshToken: string;
    }
  | {
      status: 'choose-workspace';
      selectionToken: string;
      choices: MembershipSummary[];
    }
  | {
      status: 'no-workspace';
      accessToken: string;
      refreshToken: string;
    };

export type RefreshResult = Exclude<LoginResult, { status: 'choose-workspace' }>;

const membershipInclude = { tenant: true } as const;

// How long a "forgot password" link stays usable before the user has to
// request a fresh one.
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.isSuspended) {
      throw new ForbiddenException('This account has been suspended');
    }
    return user;
  }

  async login(userId: string): Promise<LoginResult> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });

    if (user.isSuperAdmin) {
      const tokens = await this.issueTokensForSuperAdmin(userId);
      return { status: 'superadmin', ...tokens };
    }

    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: membershipInclude,
      orderBy: { createdAt: 'asc' },
    });

    return this.resolveMembershipSession(userId, memberships);
  }

  /**
   * Given a user and their current memberships, decides what kind of
   * session to issue: no-workspace (0), a real scoped session (1), or a
   * workspace-selection token to pick between several (2+). Shared between
   * login() (after the password check) and refresh() for 'account-refresh'
   * tokens — the latter is what lets a 0-membership account transparently
   * "upgrade" to a real session on its next refresh, once a teacher
   * approves them or assigns them a quiz, with no extra polling logic.
   */
  private async resolveMembershipSession(
    userId: string,
    memberships: MembershipWithTenant[],
  ): Promise<LoginResult> {
    // A membership in a suspended tenant isn't a usable session — dropped
    // here rather than surfaced as a pickable/loggable-into choice, so a
    // suspended workspace behaves like it doesn't exist for its members
    // (falling back to their other active memberships, or 'no-workspace'
    // if that was their only one).
    const active = memberships.filter((m) => m.tenant.status !== TenantStatus.SUSPENDED);

    if (active.length === 0) {
      const tokens = await this.issueAccountTokens(userId);
      return { status: 'no-workspace', ...tokens };
    }

    if (active.length === 1) {
      const tokens = await this.issueTokensForMembership(active[0]);
      return { status: 'ok', ...tokens };
    }

    const selectionToken = await this.signWorkspaceSelectionToken(userId);
    return {
      status: 'choose-workspace',
      selectionToken,
      choices: active.map((m) => this.toSummary(m)),
    };
  }

  private assertTenantActive(tenant: { status: TenantStatus }) {
    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new ForbiddenException('This workspace has been suspended');
    }
  }

  /** Re-checks account-level suspension from the DB — unlike tenant
   * suspension (scoped to one membership, already covered by whatever
   * membership row the caller fetched), a suspended User has to be caught
   * explicitly since none of the token payloads carry that flag. */
  private async assertUserActive(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isSuspended: true },
    });
    if (!user || user.isSuspended) {
      throw new ForbiddenException('This account has been suspended');
    }
  }

  private async currentTokenVersion(userId: string): Promise<number> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { tokenVersion: true },
    });
    return user.tokenVersion;
  }

  /** A refresh token's tokenVersion has to match the DB's current value —
   * changing the password bumps it, which is what makes every *other*
   * session's refresh token stop working the moment that refresh token is
   * next used. */
  private async assertTokenVersionCurrent(
    userId: string,
    tokenVersion: number,
  ): Promise<void> {
    const current = await this.currentTokenVersion(userId);
    if (current !== tokenVersion) {
      throw new UnauthorizedException('Session expired, please sign in again');
    }
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, passwordHash },
    });

    await this.notifications.notifySuperAdmins({
      type: 'USER_REGISTERED',
      title: `New user registered: ${user.name}`,
      body: user.email,
      link: '/superadmin/users',
    });

    return { id: user.id, email: user.email, name: user.name };
  }

  /**
   * Always resolves the same way regardless of whether the email matches an
   * account — otherwise the endpoint would let a caller enumerate which
   * emails are registered. No email provider is wired up yet, so the reset
   * link is logged server-side; swap the logger.log below for a real send
   * once one is.
   */
  async forgotPassword(email: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && !user.isSuspended) {
      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
        },
      });
      const webOrigin = this.config.get<string>('WEB_ORIGIN', 'http://localhost:5173');
      const resetLink = `${webOrigin}/reset-password?token=${token}`;
      this.logger.log(`Password reset requested for ${email}: ${resetLink}`);
    }
    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ ok: true }> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: resetToken.userId },
    });
    await assertPasswordNotReused(
      newPassword,
      user.passwordHash,
      user.previousPasswordHashes,
    );
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          previousPasswordHashes: pushPasswordHistory(
            user.previousPasswordHashes,
            user.passwordHash,
          ),
          // Invalidates every existing session's refresh token — whoever
          // reset the password has to sign back in everywhere.
          tokenVersion: { increment: 1 },
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      // Any other outstanding reset link for this account is now stale —
      // deleted rather than left to expire naturally on its own.
      this.prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, id: { not: resetToken.id } },
      }),
    ]);

    return { ok: true };
  }

  async getProfile(userId: string, membershipId?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    // "Member since" reflects when this workspace membership started, not
    // the account itself — falls back to the account's own createdAt for
    // callers with no membership (superadmin, 0-membership accounts).
    let memberSince = user.createdAt;
    let groups: { id: string; name: string }[] = [];
    if (membershipId) {
      const membership = await this.prisma.membership.findUnique({
        where: { id: membershipId },
      });
      if (membership) {
        memberSince = membership.createdAt;
      }
      const groupMemberships = await this.prisma.groupMember.findMany({
        where: { membershipId },
        include: { group: true },
      });
      groups = groupMemberships.map((gm) => ({
        id: gm.group.id,
        name: gm.group.name,
      }));
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
      avatarUrl: user.avatarUrl,
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: user.dateOfBirth,
      bio: user.bio,
      phone: user.phone,
      location: user.location,
      timezone: user.timezone,
      locale: user.locale,
      emailNotifications: user.emailNotifications,
      gradeLevel: user.gradeLevel,
      studentId: user.studentId,
      guardianName: user.guardianName,
      guardianContact: user.guardianContact,
      memberSince,
      groups,
    };
  }

  async updateProfile(actor: AnyTokenPayload, dto: UpdateProfileDto) {
    const userId = actor.sub;
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    // Compare against the actual current value, not just "was email present
    // in the payload" — a form that always submits the (unchanged) email
    // alongside a name-only edit shouldn't be treated as an email change.
    const changingSensitive =
      (dto.email !== undefined && dto.email !== user.email) ||
      dto.newPassword !== undefined;
    if (changingSensitive) {
      if (!dto.currentPassword) {
        throw new UnauthorizedException(
          'Current password is required to change email or password',
        );
      }
      const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!matches) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }

    const passwordChanged = dto.newPassword !== undefined;
    if (passwordChanged) {
      await assertPasswordNotReused(
        dto.newPassword!,
        user.passwordHash,
        user.previousPasswordHashes,
      );
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException('An account with this email already exists');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name ?? undefined,
        email: dto.email ?? undefined,
        passwordHash: dto.newPassword
          ? await bcrypt.hash(dto.newPassword, 10)
          : undefined,
        previousPasswordHashes: passwordChanged
          ? pushPasswordHistory(user.previousPasswordHashes, user.passwordHash)
          : undefined,
        // Invalidates every other session's refresh token — the one making
        // this change is re-issued fresh tokens below, on the new version,
        // so only it survives.
        tokenVersion: passwordChanged ? { increment: 1 } : undefined,
        avatarUrl: dto.avatarUrl ?? undefined,
        firstName: dto.firstName ?? undefined,
        lastName: dto.lastName ?? undefined,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        bio: dto.bio ?? undefined,
        phone: dto.phone ?? undefined,
        location: dto.location ?? undefined,
        timezone: dto.timezone ?? undefined,
        locale: dto.locale ?? undefined,
        emailNotifications: dto.emailNotifications ?? undefined,
        gradeLevel: dto.gradeLevel ?? undefined,
        studentId: dto.studentId ?? undefined,
        guardianName: dto.guardianName ?? undefined,
        guardianContact: dto.guardianContact ?? undefined,
      },
    });
    const profile = {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      avatarUrl: updated.avatarUrl,
      firstName: updated.firstName,
      lastName: updated.lastName,
      dateOfBirth: updated.dateOfBirth,
      bio: updated.bio,
      phone: updated.phone,
      location: updated.location,
      timezone: updated.timezone,
      locale: updated.locale,
      emailNotifications: updated.emailNotifications,
      gradeLevel: updated.gradeLevel,
      studentId: updated.studentId,
      guardianName: updated.guardianName,
      guardianContact: updated.guardianContact,
    };

    if (!passwordChanged) {
      return { profile, tokens: null };
    }
    // Bumping tokenVersion above just invalidated this session's own
    // refresh token too — hand back a fresh pair on the new version so the
    // person who just changed their password isn't logged out by it.
    const tokens = await this.reissueTokensForActor(actor);
    return { profile, tokens };
  }

  private async reissueTokensForActor(
    actor: AnyTokenPayload,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (actor.type === 'access') {
      const membership = await this.prisma.membership.findUniqueOrThrow({
        where: { id: actor.membershipId },
        include: membershipInclude,
      });
      return this.issueTokensForMembership(membership, actor.sessionId);
    }
    if (actor.type === 'superadmin') {
      return this.issueTokensForSuperAdmin(actor.sub);
    }
    return this.issueAccountTokens(actor.sub);
  }

  async selectWorkspace(
    selectionToken: string,
    membershipId: string,
  ): Promise<LoginResult> {
    let payload: WorkspaceSelectionTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<WorkspaceSelectionTokenPayload>(
        selectionToken,
        { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET') },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired selection token');
    }
    if (payload.type !== 'workspace-selection') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Re-fetched fresh from the DB rather than trusting the earlier login()
    // response's `choices` list, so a membership removed between login and
    // selection is naturally rejected here.
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: membershipInclude,
    });
    if (!membership || membership.userId !== payload.sub) {
      throw new UnauthorizedException('Membership not found for this account');
    }
    await this.assertUserActive(payload.sub);
    this.assertTenantActive(membership.tenant);

    const tokens = await this.issueTokensForMembership(membership);
    return { status: 'ok', ...tokens };
  }

  async switchWorkspace(
    userId: string,
    membershipId: string,
  ): Promise<LoginResult> {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: membershipInclude,
    });
    if (!membership || membership.userId !== userId) {
      throw new ForbiddenException('You do not have access to that workspace');
    }
    await this.assertUserActive(userId);
    this.assertTenantActive(membership.tenant);

    const tokens = await this.issueTokensForMembership(membership);
    return { status: 'ok', ...tokens };
  }

  /**
   * Lets a platform super admin act with full ADMIN rights inside any
   * tenant. Upserts a real Membership (creating one, or promoting an
   * existing non-admin one) rather than forging a scoped token out of thin
   * air — every domain guard/service (quiz ownership, audit log actor,
   * "last admin" checks, ...) already assumes a real Membership row, so
   * this reuses that machinery instead of special-casing super admins
   * throughout the codebase.
   */
  async enterWorkspace(userId: string, tenantId: string): Promise<LoginResult> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Workspace not found');
    }

    const existing = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      include: membershipInclude,
    });

    const membership =
      existing && existing.role === Role.ADMIN
        ? existing
        : existing
          ? await this.prisma.membership.update({
              where: { id: existing.id },
              data: { role: Role.ADMIN },
              include: membershipInclude,
            })
          : await this.prisma.membership.create({
              data: { userId, tenantId, role: Role.ADMIN },
              include: membershipInclude,
            });

    const tokens = await this.issueTokensForMembership(membership);
    return { status: 'ok', ...tokens };
  }

  /** Reverses enterWorkspace() — re-issues a superadmin session for an
   * account currently holding a scoped admin session. Re-checks
   * isSuperAdmin from the DB rather than trusting the caller, since the
   * access token being presented here is an ordinary 'access' token with
   * no super-admin marker of its own. */
  async exitToSuperAdmin(userId: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isSuperAdmin) {
      throw new ForbiddenException('Not a super admin account');
    }
    const tokens = await this.issueTokensForSuperAdmin(userId);
    return { status: 'superadmin', ...tokens };
  }

  async myMemberships(userId: string): Promise<MembershipSummary[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: membershipInclude,
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => this.toSummary(m));
  }

  async refresh(refreshToken: string): Promise<RefreshResult> {
    let payload:
      | RefreshTokenPayload
      | SuperAdminRefreshTokenPayload
      | AccountRefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<
        RefreshTokenPayload | SuperAdminRefreshTokenPayload | AccountRefreshTokenPayload
      >(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type === 'superadmin-refresh') {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || !user.isSuperAdmin) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      if (user.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException('Session expired, please sign in again');
      }
      const tokens = await this.issueTokensForSuperAdmin(user.id);
      return { status: 'superadmin', ...tokens };
    }

    if (payload.type === 'account-refresh') {
      await this.assertUserActive(payload.sub);
      await this.assertTokenVersionCurrent(payload.sub, payload.tokenVersion);
      // Re-derive fresh from the DB (not just re-issue another account
      // token) — this is what upgrades a 0-membership session to 'ok' or
      // 'choose-workspace' automatically once a membership exists.
      const memberships = await this.prisma.membership.findMany({
        where: { userId: payload.sub },
        include: membershipInclude,
        orderBy: { createdAt: 'asc' },
      });
      const result = await this.resolveMembershipSession(payload.sub, memberships);
      if (result.status === 'choose-workspace') {
        // A refresh cycle can't complete a workspace pick on its own — the
        // account-level session simply continues (extremely rare: it'd
        // require 2+ memberships appearing between two refreshes without
        // the user ever logging in again to see the picker).
        const tokens = await this.issueAccountTokens(payload.sub);
        return { status: 'no-workspace', ...tokens };
      }
      return result;
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const membership = await this.prisma.membership.findUnique({
      where: { id: payload.membershipId },
      include: membershipInclude,
    });
    if (!membership || membership.userId !== payload.sub) {
      throw new UnauthorizedException('Membership no longer exists');
    }
    await this.assertUserActive(payload.sub);
    await this.assertTokenVersionCurrent(payload.sub, payload.tokenVersion);
    this.assertTenantActive(membership.tenant);
    const tokens = await this.issueTokensForMembership(membership, payload.sessionId);
    return { status: 'ok', ...tokens };
  }

  /**
   * A live-locked in-progress attempt for this membership means some other
   * session is currently taking a test as this student — refuses to hand
   * out a second set of tokens until that lock is released (submitted,
   * heartbeat goes stale, or a teacher force-releases it). Skipped when
   * `existingSessionId` is passed: that means we're just refreshing an
   * already-issued session, not starting a new one, so it can't conflict
   * with the lock it may itself be holding.
   */
  private async assertNoConcurrentTestSession(membershipId: string): Promise<void> {
    const liveLock = await this.prisma.attempt.findFirst({
      where: {
        studentMembershipId: membershipId,
        status: AttemptStatus.IN_PROGRESS,
        lockSessionId: { not: null },
        lastHeartbeatAt: { gt: new Date(Date.now() - SESSION_LOCK_TIMEOUT_MS) },
      },
      select: { id: true },
    });
    if (liveLock) {
      throw new ConflictException(
        'You already have a test open on another device or browser. Finish or close it there before logging in again.',
      );
    }
  }

  private async issueTokensForMembership(
    membership: import('@prisma/client').Membership & {
      tenant: import('@prisma/client').Tenant;
    },
    existingSessionId?: string,
  ): Promise<{ accessToken: string; refreshToken: string; membership: MembershipSummary }> {
    if (!existingSessionId) {
      await this.assertNoConcurrentTestSession(membership.id);
    }
    const sessionId = existingSessionId ?? randomUUID();
    const tokenVersion = await this.currentTokenVersion(membership.userId);

    const accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.config.getOrThrow<string>(
      'JWT_REFRESH_SECRET',
    );

    const accessPayload: AccessTokenPayload = {
      sub: membership.userId,
      membershipId: membership.id,
      tenantId: membership.tenantId,
      role: membership.role,
      type: 'access',
      sessionId,
      tokenVersion,
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: membership.userId,
      membershipId: membership.id,
      type: 'refresh',
      sessionId,
      tokenVersion,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: accessSecret,
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      } as JwtSignOptions),
      this.jwt.signAsync(refreshPayload, {
        secret: refreshSecret,
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
      } as JwtSignOptions),
    ]);

    return { accessToken, refreshToken, membership: this.toSummary(membership) };
  }

  private async signWorkspaceSelectionToken(userId: string): Promise<string> {
    const payload: WorkspaceSelectionTokenPayload = {
      sub: userId,
      type: 'workspace-selection',
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: '5m',
    } as JwtSignOptions);
  }

  private async issueAccountTokens(
    userId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    const tokenVersion = await this.currentTokenVersion(userId);

    const accessPayload: AccountTokenPayload = { sub: userId, type: 'account', tokenVersion };
    const refreshPayload: AccountRefreshTokenPayload = {
      sub: userId,
      type: 'account-refresh',
      tokenVersion,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: accessSecret,
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      } as JwtSignOptions),
      this.jwt.signAsync(refreshPayload, {
        secret: refreshSecret,
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
      } as JwtSignOptions),
    ]);

    return { accessToken, refreshToken };
  }

  private async issueTokensForSuperAdmin(
    userId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.config.getOrThrow<string>(
      'JWT_REFRESH_SECRET',
    );
    const tokenVersion = await this.currentTokenVersion(userId);

    const accessPayload: SuperAdminTokenPayload = {
      sub: userId,
      type: 'superadmin',
      tokenVersion,
    };
    const refreshPayload: SuperAdminRefreshTokenPayload = {
      sub: userId,
      type: 'superadmin-refresh',
      tokenVersion,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: accessSecret,
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      } as JwtSignOptions),
      this.jwt.signAsync(refreshPayload, {
        secret: refreshSecret,
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
      } as JwtSignOptions),
    ]);

    return { accessToken, refreshToken };
  }

  private toSummary(
    membership: import('@prisma/client').Membership & {
      tenant: import('@prisma/client').Tenant;
    },
  ): MembershipSummary {
    return {
      membershipId: membership.id,
      tenantId: membership.tenantId,
      tenantName: membership.tenant.name,
      role: membership.role,
    };
  }
}
