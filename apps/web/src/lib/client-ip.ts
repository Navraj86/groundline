import "server-only";

/**
 * Headers that tell the API who the visitor is, so its rate limits apply per visitor rather
 * than to this server's address. Only sent when PROXY_SECRET is set (the API must have the
 * same value); otherwise the API falls back to the connection's address.
 */
export function clientIpHeaders(source: Headers): Record<string, string> {
  const secret = process.env.PROXY_SECRET;
  if (!secret) return {};
  const ip = source.get("x-forwarded-for")?.split(",")[0]?.trim() || source.get("x-real-ip")?.trim();
  return ip ? { "x-groundline-proxy-secret": secret, "x-client-ip": ip } : {};
}
