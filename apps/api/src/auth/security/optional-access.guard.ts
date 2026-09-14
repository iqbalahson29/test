import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
@Injectable()
export class OptionalAccessGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    if (
      !context
        .switchToHttp()
        .getRequest<{ headers: { authorization?: string } }>().headers
        .authorization
    )
      return true;
    return super.canActivate(context);
  }
}
