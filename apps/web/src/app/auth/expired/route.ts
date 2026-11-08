import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/forms";
import { clearSession } from "@/lib/session";

/**
 * Ends a session the API no longer accepts, then shows the login page. Pages can't delete
 * cookies while rendering, and the login page sends anyone with a session cookie back to
 * the dashboard, so without this a rejected token would bounce between the two forever.
 */
export async function GET(request: NextRequest) {
  await clearSession();
  const next = safeNext(request.nextUrl.searchParams.get("next"), "");
  const url = new URL("/login", request.url);
  if (next) url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}
