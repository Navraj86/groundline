"use client";

import { Ban, Play, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { EvalTemplate } from "@groundline/shared";
import { SubmitButton, TextField } from "@/components/form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { initialFormState, type FormState } from "@/lib/forms";
import { addCase, cancelRun, createDataset, createFromTemplate, deleteCase, deleteDataset, startRun } from "./actions";

type Ctx = { orgId: string; slug: string };

const TEXTAREA =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Runs a server action from a button, toasting errors. Redirecting actions never resolve here. */
function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<FormState>, success?: string) =>
    start(async () => {
      const res = await fn();
      if (res?.error) toast.error(res.error);
      else if (success) toast.success(success);
    });
  return { pending, run };
}

export function NewDatasetDialog({ ctx }: { ctx: Ctx }) {
  const [state, action] = useActionState(createDataset, initialFormState);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New dataset
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New evaluation dataset</DialogTitle>
          <DialogDescription>A set of questions your customers ask, with the answers you expect.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-5" noValidate>
          <input type="hidden" name="orgId" value={ctx.orgId} />
          <input type="hidden" name="slug" value={ctx.slug} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <TextField
              name="name"
              label="Name"
              placeholder="e.g. Billing questions"
              defaultValue={state.values?.name}
              error={state.fieldErrors?.name}
              autoFocus
              required
            />
            <TextField
              name="description"
              label="Description"
              defaultValue={state.values?.description}
              error={state.fieldErrors?.description}
            />
          </FieldGroup>
          <DialogFooter>
            <SubmitButton pendingText="Creating…">Create dataset</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TemplateButton({ ctx, template, label }: { ctx: Ctx; template: EvalTemplate; label: string }) {
  const { pending, run } = useAction();
  return (
    <Button variant="outline" disabled={pending} onClick={() => run(() => createFromTemplate(ctx.orgId, ctx.slug, template))}>
      <ShieldCheck /> {label}
    </Button>
  );
}

export function RunButton({ ctx, datasetId, disabled }: { ctx: Ctx; datasetId: string; disabled?: boolean }) {
  const { pending, run } = useAction();
  return (
    <Button disabled={pending || disabled} onClick={() => run(() => startRun(ctx.orgId, ctx.slug, datasetId))}>
      <Play /> {pending ? "Starting…" : "Run evaluation"}
    </Button>
  );
}

export function CancelRunButton({ ctx, runId }: { ctx: Ctx; runId: string }) {
  const { pending, run } = useAction();
  return (
    <Button variant="outline" disabled={pending} onClick={() => run(() => cancelRun(ctx.orgId, ctx.slug, runId), "Run cancelled.")}>
      <Ban /> Cancel run
    </Button>
  );
}

export function DeleteDatasetButton({ ctx, datasetId, name }: { ctx: Ctx; datasetId: string; name: string }) {
  const { pending, run } = useAction();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Delete dataset">
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>Its questions and the history of every run will be deleted. This can’t be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              run(() => deleteDataset(ctx.orgId, ctx.slug, datasetId));
            }}
          >
            Delete dataset
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteCaseButton({ ctx, datasetId, caseId }: { ctx: Ctx; datasetId: string; caseId: string }) {
  const { pending, run } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Remove question"
      disabled={pending}
      onClick={() => run(() => deleteCase(ctx.orgId, ctx.slug, datasetId, caseId))}
    >
      <Trash2 />
    </Button>
  );
}

export function AddCaseForm({
  ctx,
  datasetId,
  sources,
}: {
  ctx: Ctx;
  datasetId: string;
  sources: { id: string; title: string }[];
}) {
  const [state, action] = useActionState(addCase, initialFormState);
  const [decline, setDecline] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      // Resetting the form also clears the "should decline" toggle via onReset.
      form.current?.reset();
      toast.success(state.success);
    }
  }, [state]);

  return (
    <form ref={form} action={action} onReset={() => setDecline(false)} className="space-y-4" noValidate>
      <input type="hidden" name="orgId" value={ctx.orgId} />
      <input type="hidden" name="slug" value={ctx.slug} />
      <input type="hidden" name="datasetId" value={datasetId} />
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="question">Question</FieldLabel>
          <textarea
            id="question"
            name="question"
            rows={2}
            required
            defaultValue={state.success ? "" : state.values?.question}
            placeholder="How long do refunds take?"
            className={TEXTAREA}
            aria-invalid={Boolean(state.fieldErrors?.question)}
          />
          {state.fieldErrors?.question && <p className="text-sm text-destructive">{state.fieldErrors.question}</p>}
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="expectInsufficient" checked={decline} onChange={(e) => setDecline(e.target.checked)} className="size-4" />
          The assistant should decline this question
        </label>
        {!decline && (
          <>
            <Field>
              <FieldLabel htmlFor="expectedAnswer">Expected answer (optional)</FieldLabel>
              <textarea
                id="expectedAnswer"
                name="expectedAnswer"
                rows={3}
                defaultValue={state.success ? "" : state.values?.expectedAnswer}
                placeholder="Refunds reach the original card within 5–7 business days."
                className={TEXTAREA}
              />
              <FieldDescription>The facts a correct answer must include. Leave empty to only check relevance and grounding.</FieldDescription>
            </Field>
            {sources.length > 0 && (
              <Field>
                <FieldLabel htmlFor="expectedSourceIds">Expected sources (optional)</FieldLabel>
                <select id="expectedSourceIds" name="expectedSourceIds" multiple className={`${TEXTAREA} h-28`}>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
                <FieldDescription>Used to measure retrieval. Hold Ctrl or ⌘ to choose several.</FieldDescription>
              </Field>
            )}
          </>
        )}
      </FieldGroup>
      <SubmitButton size="sm" pendingText="Adding…">
        Add question
      </SubmitButton>
    </form>
  );
}
