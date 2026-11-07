"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { SubmitButton, TextField } from "@/components/form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldGroup } from "@/components/ui/field";
import { initialFormState } from "@/lib/forms";
import { updateOrganization } from "./actions";

export function OrgSettingsForm({
  orgId,
  name,
  slug,
  canEdit,
}: {
  orgId: string;
  name: string;
  slug: string;
  canEdit: boolean;
}) {
  const [state, action] = useActionState(updateOrganization, initialFormState);

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={action} className="max-w-md space-y-6" noValidate>
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="currentSlug" value={slug} />
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <TextField
          name="name"
          label="Workspace name"
          defaultValue={state.values?.name ?? name}
          error={state.fieldErrors?.name}
          disabled={!canEdit}
          required
        />
        <TextField
          name="slug"
          label="Workspace URL"
          defaultValue={state.values?.slug ?? slug}
          error={state.fieldErrors?.slug}
          disabled={!canEdit}
          hint={<span className="text-xs text-muted-foreground">Changing it breaks existing links</span>}
          required
        />
      </FieldGroup>
      {canEdit && <SubmitButton pendingText="Saving…">Save changes</SubmitButton>}
    </form>
  );
}
