import "server-only";
import { cookies } from "next/headers";
import type { AuthSession } from "@groundline/shared";
import { ACCESS_COOKIE, REFRESH_COOKIE, sessionCookieOptions } from "./session-cookies";

/**
 * Session tokens live in httpOnly cookies set by the web server. The browser never sees
 * them from JavaScript; server components and actions forward them to the API.
 */
export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}

export async function setSession(session: AuthSession): Promise<void> {
  const jar = await cookies();
  for (const [name, value, maxAge] of sessionCookieOptions(session)) {
    jar.set(name, value, maxAge);
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}
