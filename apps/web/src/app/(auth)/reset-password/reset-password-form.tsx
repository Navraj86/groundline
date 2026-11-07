"use client";

import { useActionState } from "react";
import { SubmitButton, TextField } from "@/components/form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldGroup } from "@/components/ui/field";
import { initialFormState } from "@/lib/forms";
import { resetPassword } from "../actions";

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPassword, initialFormState);
  return (
    <form action={action} className="space-y-6" noValidate>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <TextField
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={state.fieldErrors?.password}
          required
        />
        <TextField
          name="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={state.fieldErrors?.confirmPassword}
          required
        />
      </FieldGroup>
      <SubmitButton className="w-full" pendingText="Saving…">
        Update password
      </SubmitButton>
    </form>
  );
}
