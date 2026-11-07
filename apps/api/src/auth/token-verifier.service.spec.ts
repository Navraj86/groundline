import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { SignJWT } from 'jose';
import type { Env } from '../config/env.js';
import { TokenVerifier } from './token-verifier.service.js';

const SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';

function verifier(): TokenVerifier {
  const values: Partial<Env> = { SUPABASE_JWT_SECRET: SECRET, SUPABASE_AUTH_URL: 'http://localhost:9999' };
  const config = { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
  return new TokenVerifier(config);
}

function token(claims: Record<string, unknown>, opts: { secret?: string; expiresIn?: string } = {}) {
  return new SignJWT({ role: 'authenticated', email: 'asha@example.com', ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('7a90562a-d492-422a-bc7b-20ec1a1f24c7')
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '1h')
    .sign(new TextEncoder().encode(opts.secret ?? SECRET));
}

describe('TokenVerifier', () => {
  it('accepts a valid Supabase access token', async () => {
    const claims = await verifier().verify(await token({}));
    expect(claims.sub).toBe('7a90562a-d492-422a-bc7b-20ec1a1f24c7');
    expect(claims.email).toBe('asha@example.com');
  });

  it('rejects a token signed with another secret', async () => {
    await expect(verifier().verify(await token({}, { secret: 'x'.repeat(48) }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an expired token', async () => {
    const expired = await token({}, { expiresIn: '-1m' });
    await expect(verifier().verify(expired)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects tokens that are not for an authenticated user', async () => {
    await expect(verifier().verify(await token({ role: 'anon' }))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(verifier().verify(await token({ role: '' }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects garbage', async () => {
    await expect(verifier().verify('not-a-jwt')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
