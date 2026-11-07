"use client";

import { useActionState, useState } from "react";
import { slugify } from "@groundline/shared";
import { SubmitButton, TextField } from "@/components/form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldGroup } from "@/components/ui/field";
import { initialFormState } from "@/lib/forms";
import { createOrganization } from "./actions";

export function CreateOrgForm() {
  const [state, action] = useActionState(createOrganization, initialFormState);
  const [name, setName] = useState(state.values?.name ?? "");
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(state.values?.slug));

  const effectiveSlug = slugTouched ? slug : slugify(name);

  return (
    <form action={action} className="space-y-6" noValidate>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <TextField
          name="name"
          label="Company or team name"
          placeholder="Acme Inc."
          autoComplete="organization"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={state.fieldErrors?.name}
          autoFocus
          required
        />
        <TextField
          name="slug"
          label="Workspace URL"
          placeholder="acme"
          value={effectiveSlug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
          error={state.fieldErrors?.slug}
          hint={<span className="text-xs text-muted-foreground">groundline.app/o/{effectiveSlug || "…"}</span>}
        />
      </FieldGroup>
      <SubmitButton className="w-full" pendingText="Creating workspace…">
        Create workspace
      </SubmitButton>
    </form>
  );
}
