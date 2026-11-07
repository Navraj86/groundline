import type { Metadata } from "next";
import Link from "next/link";
import { safeNext } from "@/lib/forms";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNext(next);
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your Groundline workspace.</p>
      </div>
      <LoginForm next={nextPath} />
      <p className="text-center text-sm text-muted-foreground">
        New to Groundline?{" "}
        <Link
          href={nextPath === "/dashboard" ? "/signup" : `/signup?next=${encodeURIComponent(nextPath)}`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
