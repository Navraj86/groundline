import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type { Env } from '../config/env.js';

export interface AuthClaims extends JWTPayload {
  sub: string;
  email?: string;
  role?: string;
  session_id?: string;
  /** Authentication methods for this session, e.g. `[{ method: 'recovery' }]` after a reset link. */
  amr?: { method: string; timestamp: number }[];
  user_metadata?: { full_name?: string; avatar_url?: string };
}

/** Verifies Supabase Auth access tokens locally, without a network call per request. */
@Injectable()
export class TokenVerifier {
  private readonly secret?: Uint8Array;
  private readonly jwks?: JWTVerifyGetKey;

  constructor(config: ConfigService<Env, true>) {
    const secret = config.get('SUPABASE_JWT_SECRET', { infer: true });
    const authUrl = config.get('SUPABASE_AUTH_URL', { infer: true }).replace(/\/+$/, '');
    if (secret) {
      this.secret = new TextEncoder().encode(secret);
    } else {
      // Projects using asymmetric signing keys publish them here.
      this.jwks = createRemoteJWKSet(new URL(`${authUrl}/.well-known/jwks.json`));
    }
  }

  async verify(token: string): Promise<AuthClaims> {
    try {
      const options = { audience: 'authenticated' };
      const { payload } = this.secret
        ? await jwtVerify(token, this.secret, { ...options, algorithms: ['HS256'] })
        : await jwtVerify(token, this.jwks!, options);

      if (typeof payload.sub !== 'string' || payload.role !== 'authenticated') {
        throw new Error('Token is not for an authenticated user');
      }
      return payload as AuthClaims;
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }
}
