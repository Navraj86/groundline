import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import { setSession } from "@/lib/session";

const bodySchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.coerce.number().int().positive(),
});

/**
 * Stores a session that Supabase Auth handed to the browser in a URL fragment after an
 * email link (confirmation, password reset). Called by /auth/callback.
 */
export async function POST(request: NextRequest) {
  // Only accept same-origin requests so another site can't plant a session (login CSRF).
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Invalid session" }, { status: 400 });

  try {
    // Verifies the token with the API (and creates the user's profile on first sign-in).
    await api("/me", { token: parsed.data.accessToken });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ message: "This link is invalid or has expired." }, { status });
  }

  await setSession(parsed.data);
  return NextResponse.json({ ok: true });
}
