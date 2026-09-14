import {
  ExecutionContext,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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
    // A failure raised *inside* session validation is not an authentication failure.
    // SessionService.validateAccess already classifies database faults as 503; collapsing
    // every `err` into 401 here turned an outage into "your session is invalid", which made
    // clients drop a good session and retry a refresh instead of reconnecting.
    if (err instanceof HttpException && err.getStatus() !== 401) {
      throw err;
    }
    if (err || !user) {
      throw new UnauthorizedException();
    }
    if (user.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }
    return user as TUser;
  }
}
