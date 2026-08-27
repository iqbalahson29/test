import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AccessTokenPayload } from './token.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AccessTokenPayload }>();
    return request.user;
  },
);
