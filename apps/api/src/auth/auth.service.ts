import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  AccessTokenPayload,
  AccountRefreshTokenPayload,
  AccountTokenPayload,
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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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
    return user;
  }

  async login(userId: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
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
    if (memberships.length === 0) {
      const tokens = await this.issueAccountTokens(userId);
      return { status: 'no-workspace', ...tokens };
    }

    if (memberships.length === 1) {
      const tokens = await this.issueTokensForMembership(memberships[0]);
      return { status: 'ok', ...tokens };
    }

    const selectionToken = await this.signWorkspaceSelectionToken(userId);
    return {
      status: 'choose-workspace',
      selectionToken,
      choices: memberships.map((m) => this.toSummary(m)),
    };
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
    return { id: user.id, email: user.email, name: user.name };
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

  async updateProfile(userId: string, dto: UpdateProfileDto) {
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
    return {
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

    const tokens = await this.issueTokensForMembership(membership);
    return { status: 'ok', ...tokens };
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
      const tokens = await this.issueTokensForSuperAdmin(user.id);
      return { status: 'superadmin', ...tokens };
    }

    if (payload.type === 'account-refresh') {
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
    const tokens = await this.issueTokensForMembership(membership);
    return { status: 'ok', ...tokens };
  }

  private async issueTokensForMembership(
    membership: import('@prisma/client').Membership & {
      tenant: import('@prisma/client').Tenant;
    },
  ): Promise<{ accessToken: string; refreshToken: string; membership: MembershipSummary }> {
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
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: membership.userId,
      membershipId: membership.id,
      type: 'refresh',
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

    const accessPayload: AccountTokenPayload = { sub: userId, type: 'account' };
    const refreshPayload: AccountRefreshTokenPayload = {
      sub: userId,
      type: 'account-refresh',
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

    const accessPayload: SuperAdminTokenPayload = {
      sub: userId,
      type: 'superadmin',
    };
    const refreshPayload: SuperAdminRefreshTokenPayload = {
      sub: userId,
      type: 'superadmin-refresh',
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
