import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_LABELS, type InvitationPreview } from "@groundline/shared";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { signOut } from "../../(auth)/actions";
import { AcceptButton } from "./accept-button";

export const metadata: Metadata = { title: "Join a workspace" };

const CLOSED_MESSAGES: Record<string, string> = {
  EXPIRED: "This invitation has expired. Ask the person who invited you to send a new one.",
  REVOKED: "This invitation was cancelled.",
  ACCEPTED: "This invitation has already been used.",
};

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const next = `/invite/${token}`;

  let invite: InvitationPreview | null = null;
  try {
    invite = await api<InvitationPreview>(`/invitations/${encodeURIComponent(token)}`, { auth: false });
  } catch (err) {
    if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 400)) throw err;
  }
  const me = invite ? await getMe() : null;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 p-6">
      <Logo />
      <Card className="w-full max-w-md">
        {!invite ? (
          <CardHeader>
            <CardTitle>Invitation not found</CardTitle>
            <CardDescription>This link is invalid. Check that you copied the whole link from the email.</CardDescription>
          </CardHeader>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="text-xl">Join {invite.organizationName}</CardTitle>
              <CardDescription>
                {invite.invitedByName ?? "A teammate"} invited{" "}
                <span className="font-medium text-foreground">{invite.email}</span> to join as{" "}
                <span className="font-medium text-foreground">{ROLE_LABELS[invite.role]}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {invite.status !== "PENDING" ? (
                <p className="text-sm text-muted-foreground">{CLOSED_MESSAGES[invite.status]}</p>
              ) : !me ? (
                <>
                  <Button asChild className="w-full">
                    <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account to accept</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/login?next=${encodeURIComponent(next)}`}>I already have an account</Link>
                  </Button>
                </>
              ) : me.email !== invite.email ? (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    You&apos;re signed in as <span className="font-medium text-foreground">{me.email}</span>. Sign in
                    as {invite.email} to accept this invitation.
                  </p>
                  <form action={signOut}>
                    <Button type="submit" variant="outline" className="w-full">
                      Sign out
                    </Button>
                  </form>
                </div>
              ) : (
                <AcceptButton token={token} />
              )}
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
