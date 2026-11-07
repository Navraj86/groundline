import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthSession } from '@groundline/shared';
import type { Env } from '../config/env.js';

/** Subset of the Supabase Auth (GoTrue) session payload that the API uses. */
interface GoTrueSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  user: GoTrueUser;
}

interface GoTrueUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
}

interface GoTrueError {
  code?: number;
  error_code?: string;
  msg?: string;
  error?: string;
  error_description?: string;
}

/**
 * Minimal client for the Supabase Auth REST API.
 *
 * The browser never talks to Supabase directly: the web app calls this API, which keeps
 * the auth provider swappable and lets us apply our own rate limits and audit logging.
 * Works against a self-hosted GoTrue (local dev) or a Supabase project's `/auth/v1`.
 */
@Injectable()
export class SupabaseAuthClient {
  private readonly logger = new Logger(SupabaseAuthClient.name);
  private readonly baseUrl: string;
  private readonly anonKey: string;
  private readonly webUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get('SUPABASE_AUTH_URL', { infer: true }).replace(/\/+$/, '');
    this.anonKey = config.get('SUPABASE_ANON_KEY', { infer: true });
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  /** Where links in auth emails send the user once Supabase has verified the token. */
  private callbackUrl(next: string): string {
    return `${this.webUrl}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async signUp(email: string, password: string, fullName: string): Promise<AuthSession | null> {
    const body = await this.request<GoTrueSession | GoTrueUser>('/signup', {
      method: 'POST',
      query: { redirect_to: this.callbackUrl('/onboarding') },
      body: { email, password, data: { full_name: fullName } },
    });
    // With email confirmation enabled GoTrue returns the user without a session.
    return 'access_token' in body ? toSession(body) : null;
  }

  async signInWithPassword(email: string, password: string): Promise<AuthSession> {
    return toSession(
      await this.request<GoTrueSession>('/token', {
        method: 'POST',
        query: { grant_type: 'password' },
        body: { email, password },
      }),
    );
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    return toSession(
      await this.request<GoTrueSession>('/token', {
        method: 'POST',
        query: { grant_type: 'refresh_token' },
        body: { refresh_token: refreshToken },
      }),
    );
  }

  async signOut(accessToken: string): Promise<void> {
    await this.request('/logout', { method: 'POST', query: { scope: 'local' }, accessToken });
  }

  async sendPasswordReset(email: string): Promise<void> {
    await this.request('/recover', {
      method: 'POST',
      query: { redirect_to: this.callbackUrl('/reset-password') },
      body: { email },
    });
  }

  async resendConfirmation(email: string): Promise<void> {
    await this.request('/resend', {
      method: 'POST',
      query: { redirect_to: this.callbackUrl('/onboarding') },
      body: { type: 'signup', email },
    });
  }

  async updatePassword(accessToken: string, password: string): Promise<void> {
    await this.request('/user', { method: 'PUT', accessToken, body: { password } });
  }

  async updateUserMetadata(accessToken: string, data: Record<string, unknown>): Promise<void> {
    await this.request('/user', { method: 'PUT', accessToken, body: { data } });
  }

  private async request<T = unknown>(
    path: string,
    opts: {
      method: 'GET' | 'POST' | 'PUT';
      query?: Record<string, string>;
      body?: unknown;
      accessToken?: string;
    },
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.anonKey) headers.apikey = this.anonKey;
    if (opts.accessToken) headers.authorization = `Bearer ${opts.accessToken}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      this.logger.error(`Auth server unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Authentication service is unavailable. Try again shortly.');
    }

    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) throw this.toHttpException(res.status, (data ?? {}) as GoTrueError);
    return data as T;
  }

  private toHttpException(status: number, err: GoTrueError): HttpException {
    const code = err.error_code ?? err.error;
    const message = err.msg ?? err.error_description ?? 'Authentication request failed';

    switch (code) {
      case 'invalid_credentials':
      case 'invalid_grant':
        return new UnauthorizedException('Incorrect email or password.');
      case 'email_not_confirmed':
        return new UnauthorizedException({
          statusCode: 401,
          code: 'email_not_confirmed',
          message: 'Confirm your email address before signing in.',
        });
      case 'refresh_token_not_found':
      case 'refresh_token_already_used':
      case 'session_not_found':
      case 'bad_jwt':
        return new UnauthorizedException('Your session has expired. Sign in again.');
      case 'user_already_exists':
      case 'email_exists':
        return new ConflictException('An account with this email already exists.');
      case 'weak_password':
        return new BadRequestException(message);
      case 'same_password':
        return new BadRequestException('Choose a password different from your current one.');
      case 'over_email_send_rate_limit':
      case 'over_request_rate_limit':
        return new HttpException('Too many requests. Wait a moment and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }

    if (status >= 500) {
      this.logger.error(`Auth server error ${status}: ${code ?? ''} ${message}`);
      return new ServiceUnavailableException('Authentication service error. Try again shortly.');
    }
    return new HttpException(message, status);
  }
}

function toSession(s: GoTrueSession): AuthSession {
  return {
    accessToken: s.access_token,
    refreshToken: s.refresh_token,
    expiresAt: s.expires_at ?? Math.floor(Date.now() / 1000) + s.expires_in,
  };
}
