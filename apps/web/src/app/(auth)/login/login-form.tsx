"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { SubmitButton, TextField } from "@/components/form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { initialFormState } from "@/lib/forms";
import { resendConfirmation, signIn } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, initialFormState);
  const [email, setEmail] = useState(state.values?.email ?? "");
  const [resending, startResend] = useTransition();

  const unconfirmed = state.code === "email_not_confirmed";

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>
            {state.error}
            {unconfirmed && (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                disabled={resending}
                onClick={() =>
                  startResend(async () => {
                    const res = await resendConfirmation(email);
                    if (res.error) toast.error(res.error);
                    else toast.success(`We sent a new confirmation link to ${email}.`);
                  })
                }
              >
                Resend confirmation email
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <TextField
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={state.fieldErrors?.email}
          required
        />
        <TextField
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={state.fieldErrors?.password}
          required
          hint={
            <Link href="/forgot-password" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
              Forgot password?
            </Link>
          }
        />
      </FieldGroup>
      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
