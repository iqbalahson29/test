import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AccessTokenPayload, AnyTokenPayload } from './token.types';

/**
 * Requires a valid 'access' token specifically — rejects refresh/superadmin
 * payloads even though they'd pass signature verification. Super-admin-only
 * routes use the bare `AuthGuard('jwt')` + `SuperAdminGuard` instead, since
 * a superadmin token has no membership/role to satisfy this guard's shape.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AccessTokenPayload>(
    err: unknown,
    user: AnyTokenPayload | false,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    void info;
    void context;
    if (err || !user) {
      throw new UnauthorizedException();
    }
    if (user.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }
    return user as TUser;
  }
}
