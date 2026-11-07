import type { AuthSession } from "@groundline/shared";

// Shared by server code and proxy.ts, so this module must stay free of `server-only`
// and `next/headers` imports.

export const ACCESS_COOKIE = "gl_access";
export const REFRESH_COOKIE = "gl_refresh";

const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days; the auth server enforces the real lifetime.

type CookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
};

export function sessionCookieOptions(
  session: AuthSession,
): [name: string, value: string, options: CookieOptions][] {
  const base = {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/" as const,
  };
  const accessMaxAge = Math.max(60, session.expiresAt - Math.floor(Date.now() / 1000));
  return [
    [ACCESS_COOKIE, session.accessToken, { ...base, maxAge: accessMaxAge }],
    [REFRESH_COOKIE, session.refreshToken, { ...base, maxAge: REFRESH_MAX_AGE }],
  ];
}

/** Reads the `exp` claim without verifying the signature (the API verifies tokens). */
export function tokenExpiresAt(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}
