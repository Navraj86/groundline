import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { requireMe } from "@/lib/auth";
import { signOut } from "../(auth)/actions";
import { CreateOrgForm } from "./create-org-form";

export const metadata: Metadata = { title: "Create a workspace" };

export default async function OnboardingPage() {
  const me = await requireMe("/onboarding");
  const firstName = me.fullName?.split(" ")[0];
  const hasOrgs = me.organizations.length > 0;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between p-6">
        <Logo href={hasOrgs ? "/dashboard" : "/onboarding"} />
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{me.email}</span>
          <form action={signOut}>
            <Button variant="ghost" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Step 1 of 1</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {firstName ? `Welcome, ${firstName}.` : "Welcome."} Let&apos;s set up your workspace.
            </h1>
            <p className="text-sm text-muted-foreground">
              A workspace holds your knowledge base, conversations, tickets and team. You can invite teammates next.
            </p>
          </div>
          <CreateOrgForm />
          {hasOrgs && (
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/dashboard" className="underline-offset-4 hover:underline">
                Back to your workspaces
              </Link>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
