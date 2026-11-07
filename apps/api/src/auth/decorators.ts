import { createParamDecorator, ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';
import type { AppRequest, AuthContext } from './auth.types.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Skips the global authentication guard for a route or controller. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** The authenticated caller. Only valid on routes behind the auth guard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const auth = ctx.switchToHttp().getRequest<AppRequest>().auth;
  if (!auth) throw new UnauthorizedException();
  return auth;
});
