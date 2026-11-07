"use client";

import { MailCheck } from "lucide-react";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { SubmitButton, TextField } from "@/components/form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { initialFormState } from "@/lib/forms";
import { resendConfirmation, signUp } from "../actions";

export function SignupForm({ next }: { next: string }) {
  const [state, action] = useActionState(signUp, initialFormState);
  const [resending, startResend] = useTransition();

  if (state.success) {
    const email = state.success;
    return (
      <div className="space-y-4 rounded-lg border p-6 text-center">
        <MailCheck className="mx-auto size-10 text-muted-foreground" />
        <div className="space-y-1">
          <h2 className="font-semibold">Check your inbox</h2>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>. Open it to
            finish creating your account.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={resending}
          onClick={() =>
            startResend(async () => {
              const res = await resendConfirmation(email);
              if (res.error) toast.error(res.error);
              else toast.success("Confirmation email sent again.");
            })
          }
        >
          Resend email
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <TextField
          name="fullName"
          label="Full name"
          autoComplete="name"
          defaultValue={state.values?.fullName}
          error={state.fieldErrors?.fullName}
          required
        />
        <TextField
          name="email"
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
          required
        />
        <TextField
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={state.fieldErrors?.password}
          required
        />
      </FieldGroup>
      <SubmitButton className="w-full" pendingText="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
