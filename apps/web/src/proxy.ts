import { NextResponse, type NextRequest } from "next/server";
import type { AuthSession } from "@groundline/shared";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  sessionCookieOptions,
  tokenExpiresAt,
} from "./lib/session-cookies";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/o/"];
const GUEST_ONLY = ["/login", "/signup"];
// Refresh a little early so a token doesn't expire mid-request.
const REFRESH_LEEWAY_SECONDS = 60;

/**
 * Keeps the session fresh and does an optimistic auth check before rendering.
 * Authorization itself happens in the API; this only avoids rendering pages that
 * would immediately redirect.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  let session: AuthSession | null = null;
  let signedIn = Boolean(access);

  const exp = access ? tokenExpiresAt(access) : null;
  const needsRefresh = !access || !exp || exp - Date.now() / 1000 < REFRESH_LEEWAY_SECONDS;
  if (needsRefresh && refresh) {
    session = await refreshSession(refresh);
    signedIn = Boolean(session);
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));
  let response: NextResponse;

  if (isProtected && !signedIn) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    response = NextResponse.redirect(url);
  } else if (signedIn && GUEST_ONLY.includes(pathname)) {
    response = NextResponse.redirect(new URL("/dashboard", request.url));
  } else if (session) {
    // Make the refreshed tokens visible to server components rendering this request.
    request.cookies.set(ACCESS_COOKIE, session.accessToken);
    request.cookies.set(REFRESH_COOKIE, session.refreshToken);
    response = NextResponse.next({ request });
  } else {
    response = NextResponse.next();
  }

  if (session) {
    for (const [name, value, options] of sessionCookieOptions(session)) {
      response.cookies.set(name, value, options);
    }
  } else if (needsRefresh && refresh) {
    // The refresh token was rejected: drop the dead session.
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
  }
  return response;
}

async function refreshSession(refreshToken: string): Promise<AuthSession | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as AuthSession) : null;
  } catch {
    return null;
  }
}

export const config = {
  // Skip static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
