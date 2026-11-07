"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { SubmitButton, TextField } from "@/components/form-fields";
import { FieldGroup } from "@/components/ui/field";
import { initialFormState } from "@/lib/forms";
import { updateProfile } from "./actions";

export function ProfileForm({ fullName, email }: { fullName: string; email: string }) {
  const [state, action] = useActionState(updateProfile, initialFormState);

  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="max-w-md space-y-6" noValidate>
      <FieldGroup>
        <TextField
          name="fullName"
          label="Full name"
          autoComplete="name"
          defaultValue={state.values?.fullName ?? fullName}
          error={state.fieldErrors?.fullName}
          required
        />
        <TextField name="email" label="Email" value={email} disabled readOnly />
      </FieldGroup>
      <SubmitButton pendingText="Saving…">Save profile</SubmitButton>
    </form>
  );
}
