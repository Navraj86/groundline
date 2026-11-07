"use client";

import { Check, Copy, RefreshCw } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import type { AssistantSettings } from "@groundline/shared";
import { SubmitButton, TextField } from "@/components/form-fields";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { initialFormState } from "@/lib/forms";
import { rotateWidgetKey, saveAssistant } from "./actions";

const TEXTAREA =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 aria-invalid:border-destructive";

export function AssistantForm({
  orgId,
  slug,
  settings,
  canEdit,
}: {
  orgId: string;
  slug: string;
  settings: AssistantSettings;
  canEdit: boolean;
}) {
  const [state, action] = useActionState(saveAssistant, initialFormState);
  const values = state.values ?? settings;
  const [color, setColor] = useState(values.brandColor ?? settings.brandColor);

  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="slug" value={slug} />
      <FieldGroup>
        <TextField
          name="name"
          label="Assistant name"
          defaultValue={values.name}
          error={state.fieldErrors?.name}
          disabled={!canEdit}
          required
        />
        <Field data-invalid={state.fieldErrors?.greeting ? true : undefined}>
          <FieldLabel htmlFor="greeting">Greeting</FieldLabel>
          <textarea id="greeting" name="greeting" rows={2} defaultValue={values.greeting} disabled={!canEdit} className={TEXTAREA} />
          <FieldDescription>The first message visitors see when they open the chat.</FieldDescription>
          {state.fieldErrors?.greeting && <FieldError>{state.fieldErrors.greeting}</FieldError>}
        </Field>
        <Field data-invalid={state.fieldErrors?.instructions ? true : undefined}>
          <FieldLabel htmlFor="instructions">Extra instructions</FieldLabel>
          <textarea
            id="instructions"
            name="instructions"
            rows={4}
            defaultValue={values.instructions}
            disabled={!canEdit}
            placeholder="e.g. Keep answers under 3 sentences. Mention our 24/7 phone line for urgent issues."
            className={TEXTAREA}
          />
          <FieldDescription>
            Tone and style guidance. The assistant still answers only from your knowledge base.
          </FieldDescription>
          {state.fieldErrors?.instructions && <FieldError>{state.fieldErrors.instructions}</FieldError>}
        </Field>
        <Field data-invalid={state.fieldErrors?.brandColor ? true : undefined}>
          <FieldLabel htmlFor="brandColor">Brand color</FieldLabel>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Pick brand color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              disabled={!canEdit}
              className="h-9 w-12 cursor-pointer rounded border bg-background p-1"
            />
            <input
              id="brandColor"
              name="brandColor"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              disabled={!canEdit}
              className="h-9 w-28 rounded-md border border-input bg-background px-3 font-mono text-sm"
            />
          </div>
          {state.fieldErrors?.brandColor && <FieldError>{state.fieldErrors.brandColor}</FieldError>}
        </Field>
      </FieldGroup>
      {canEdit ? (
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
      ) : (
        <p className="text-xs text-muted-foreground">Only owners and admins can change the assistant.</p>
      )}
    </form>
  );
}

export function EmbedSnippet({
  snippet,
  orgId,
  slug,
  canRotate,
}: {
  snippet: string;
  orgId: string;
  slug: string;
  canRotate: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 text-xs leading-relaxed">
        <code>{snippet}</code>
      </pre>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(snippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy snippet"}
        </Button>
        {canRotate && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={pending}>
                <RefreshCw /> Rotate key
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Rotate the widget key?</AlertDialogTitle>
                <AlertDialogDescription>
                  The chat stops working on any site still using the current snippet until you replace it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    start(async () => {
                      const res = await rotateWidgetKey(orgId, slug);
                      if (res.error) toast.error(res.error);
                      else toast.success(res.success);
                    })
                  }
                >
                  Rotate key
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
