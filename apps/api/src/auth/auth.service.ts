import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccessTokenPayload,
  RefreshTokenPayload,
  SuperAdminRefreshTokenPayload,
  SuperAdminTokenPayload,
} from './token.types';

export interface MembershipSummary {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  role: import('@prisma/client').Role;
}

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
    };

export type RefreshResult =
  | { status: 'ok'; accessToken: string; refreshToken: string; membership: MembershipSummary }
  | { status: 'superadmin'; accessToken: string; refreshToken: string };

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

    const membership = await this.prisma.membership.findUnique({
      where: { userId },
      include: membershipInclude,
    });
    if (!membership) {
      throw new ForbiddenException('This account has no tenant access');
    }

    const tokens = await this.issueTokensForMembership(membership);
    return { status: 'ok', ...tokens };
  }

  async refresh(refreshToken: string): Promise<RefreshResult> {
    let payload: RefreshTokenPayload | SuperAdminRefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<
        RefreshTokenPayload | SuperAdminRefreshTokenPayload
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
