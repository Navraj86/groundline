"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

function safeNext(value: string | null, fallback: string): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

/**
 * Stores the session from the URL fragment and returns where to go next, or throws with a
 * message to show. The fragment is cleared from the address bar either way.
 */
async function completeSignIn(): Promise<string> {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  window.history.replaceState(null, "", window.location.pathname + window.location.search);

  const linkError = hash.get("error_description") ?? query.get("error_description");
  if (linkError) throw new Error(linkError.replace(/\+/g, " "));

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const expiresAt = hash.get("expires_at");
  if (!accessToken || !refreshToken || !expiresAt) {
    throw new Error("This link is missing sign-in details. Try opening it again from your email.");
  }

  const res = await fetch("/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accessToken, refreshToken, expiresAt }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "We couldn't sign you in with this link.");
  }
  return hash.get("type") === "recovery" ? "/reset-password" : safeNext(query.get("next"), "/dashboard");
}

/**
 * Landing page for links in auth emails. Supabase Auth verifies the link, then redirects
 * here with the new session in the URL fragment, which only the browser can read. We hand
 * it to our server to store in httpOnly cookies.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeSignIn()
      .then((next) => {
        router.replace(next);
        router.refresh();
      })
      .catch((err: Error) => setError(err.message || "We couldn't sign you in with this link."));
  }, [router]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 p-6">
      <Logo />
      {error ? (
        <div className="max-w-sm space-y-4 text-center">
          <h1 className="text-lg font-semibold">This link didn&apos;t work</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <div className="flex justify-center gap-2">
            <Button asChild variant="outline">
              <Link href="/forgot-password">Request a new link</Link>
            </Button>
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Signing you in…
        </p>
      )}
    </main>
  );
}
