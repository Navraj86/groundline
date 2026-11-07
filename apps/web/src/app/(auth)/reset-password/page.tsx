import type { Metadata } from "next";
import { requireMe } from "@/lib/auth";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // The reset link signs the user in with a recovery session first.
  const me = await requireMe("/reset-password");
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">
          for <span className="font-medium text-foreground">{me.email}</span>
        </p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
