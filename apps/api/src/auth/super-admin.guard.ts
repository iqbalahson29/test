import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AnyTokenPayload } from './token.types';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user: AnyTokenPayload }>();
    return request.user?.type === 'superadmin';
  }
}
