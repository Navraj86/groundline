"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton, TextField } from "@/components/form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldGroup } from "@/components/ui/field";
import { initialFormState } from "@/lib/forms";
import { forgotPassword } from "../actions";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(forgotPassword, initialFormState);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          Enter the email you signed up with and we&apos;ll send you a link to choose a new password.
        </p>
      </div>
      {state.success ? (
        <Alert>
          <AlertDescription>
            If an account exists for <span className="font-medium text-foreground">{state.success}</span>, a reset link
            is on its way. It expires in one hour.
          </AlertDescription>
        </Alert>
      ) : (
        <form action={action} className="space-y-6" noValidate>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <TextField
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              defaultValue={state.values?.email}
              error={state.fieldErrors?.email}
              required
            />
          </FieldGroup>
          <SubmitButton className="w-full" pendingText="Sending…">
            Send reset link
          </SubmitButton>
        </form>
      )}
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
