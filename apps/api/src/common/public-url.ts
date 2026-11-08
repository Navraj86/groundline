import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Rejects URLs that would let an organization make our servers call internal services
 * (SSRF): non-https schemes and hosts that resolve to private, loopback, link-local or
 * otherwise non-public addresses. Development allows local addresses for testing.
 */
export async function assertPublicUrl(url: string, opts: { allowPrivate: boolean }): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('Enter a valid URL.');
  }
  if (opts.allowPrivate && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) return;
  if (parsed.protocol !== 'https:') throw new BadRequestException('The URL must use https.');

  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new BadRequestException(`Could not resolve ${host}.`);
  if (addresses.some(isPrivateAddress)) {
    throw new BadRequestException('The URL must point to a public internet address.');
  }
}

export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = address.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}
