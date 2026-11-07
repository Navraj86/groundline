import type { Metadata } from "next";
import Link from "next/link";
import { safeNext } from "@/lib/forms";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  const nextPath = safeNext(next, "/onboarding");
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">Set up an AI support agent trained on your documentation.</p>
      </div>
      <SignupForm next={nextPath} />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
