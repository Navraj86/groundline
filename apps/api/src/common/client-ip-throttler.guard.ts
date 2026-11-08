import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export const PROXY_SECRET_HEADER = 'x-groundline-proxy-secret';
export const CLIENT_IP_HEADER = 'x-client-ip';

interface TrackableRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Rate limits per visitor even when the web app runs on another host (e.g. Vercel), where
 * every request reaches the API from the host's own addresses. The web app passes the
 * visitor's IP in `x-client-ip` along with a shared secret (PROXY_SECRET); without a matching
 * secret the header is ignored, so callers can't pick their own rate-limit bucket.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    return clientIp(req as unknown as TrackableRequest, process.env.PROXY_SECRET ?? '');
  }
}

export function clientIp(req: TrackableRequest, secret: string): string {
  const fallback = req.ip ?? 'unknown';
  if (!secret) return fallback;
  const given = header(req, PROXY_SECRET_HEADER);
  const ip = header(req, CLIENT_IP_HEADER)?.trim();
  if (!given || !ip || isIP(ip) === 0) return fallback;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b) ? ip : fallback;
}

function header(req: TrackableRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
