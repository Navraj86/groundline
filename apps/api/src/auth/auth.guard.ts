import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsersService } from '../users/users.service.js';
import type { AppRequest } from './auth.types.js';
import { IS_PUBLIC_KEY } from './decorators.js';
import { TokenVerifier } from './token-verifier.service.js';

/**
 * Global guard: every route requires a valid Supabase access token unless marked @Public().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');

    const accessToken = header.slice('Bearer '.length).trim();
    const claims = await this.verifier.verify(accessToken);
    await this.users.ensureProfile(claims);

    req.auth = { userId: claims.sub, email: (claims.email ?? '').toLowerCase(), accessToken, claims };
    return true;
  }
}
