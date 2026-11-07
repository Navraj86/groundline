"use client";

import { FileText, Globe, Plus, Type } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { SubmitButton, TextField } from "@/components/form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { initialFormState, type FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { addText, addUrl, uploadFile } from "./actions";

type Mode = "file" | "url" | "text";
type Ctx = { orgId: string; slug: string };

const MODES: { id: Mode; label: string; icon: typeof FileText }[] = [
  { id: "file", label: "Upload file", icon: FileText },
  { id: "url", label: "Website", icon: Globe },
  { id: "text", label: "Paste text", icon: Type },
];

export function AddSourceDialog({ orgId, slug }: Ctx) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("file");
  const [formKey, setFormKey] = useState(0);
  const done = () => setOpen(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add source
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to the knowledge base</DialogTitle>
          <DialogDescription>The assistant answers customers only from what you add here.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="tablist">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition",
                mode === id && "bg-background font-medium text-foreground shadow-sm",
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        {mode === "file" && <FileForm key={`f${formKey}`} orgId={orgId} slug={slug} onDone={done} />}
        {mode === "url" && <UrlForm key={`u${formKey}`} orgId={orgId} slug={slug} onDone={done} />}
        {mode === "text" && <TextForm key={`t${formKey}`} orgId={orgId} slug={slug} onDone={done} />}
      </DialogContent>
    </Dialog>
  );
}

function useResult(state: FormState, onDone: () => void) {
  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onDone();
    }
  }, [state, onDone]);
}

function ErrorAlert({ state, slug }: { state: FormState; slug: string }) {
  if (!state.error) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {state.error}
        {state.code === "plan_limit_reached" && (
          <Link href={`/o/${slug}/billing`} className="font-medium underline underline-offset-4">
            View plans
          </Link>
        )}
      </AlertDescription>
    </Alert>
  );
}

function Hidden({ orgId, slug }: Ctx) {
  return (
    <>
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="slug" value={slug} />
    </>
  );
}

function FileForm({ orgId, slug, onDone }: Ctx & { onDone: () => void }) {
  const [state, action] = useActionState(uploadFile, initialFormState);
  useResult(state, onDone);
  return (
    <form action={action} className="space-y-5">
      <Hidden orgId={orgId} slug={slug} />
      <ErrorAlert state={state} slug={slug} />
      <Field data-invalid={state.fieldErrors?.file ? true : undefined}>
        <FieldLabel htmlFor="file">Document</FieldLabel>
        <input
          id="file"
          name="file"
          type="file"
          accept=".pdf,.txt,.md,.markdown"
          required
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm file:font-medium"
        />
        <FieldDescription>PDF, plain text or Markdown, up to 20 MB.</FieldDescription>
        {state.fieldErrors?.file && <FieldError>{state.fieldErrors.file}</FieldError>}
      </Field>
      <DialogFooter>
        <SubmitButton pendingText="Uploading…">Upload</SubmitButton>
      </DialogFooter>
    </form>
  );
}

function UrlForm({ orgId, slug, onDone }: Ctx & { onDone: () => void }) {
  const [state, action] = useActionState(addUrl, initialFormState);
  useResult(state, onDone);
  return (
    <form action={action} className="space-y-5" noValidate>
      <Hidden orgId={orgId} slug={slug} />
      <ErrorAlert state={state} slug={slug} />
      <FieldGroup>
        <TextField
          name="url"
          label="Page URL"
          type="url"
          placeholder="https://help.example.com/refunds"
          defaultValue={state.values?.url}
          error={state.fieldErrors?.url}
          autoFocus
          required
        />
      </FieldGroup>
      <p className="text-xs text-muted-foreground">
        We index this one page. Add each help article you want the assistant to know.
      </p>
      <DialogFooter>
        <SubmitButton pendingText="Adding…">Add page</SubmitButton>
      </DialogFooter>
    </form>
  );
}

function TextForm({ orgId, slug, onDone }: Ctx & { onDone: () => void }) {
  const [state, action] = useActionState(addText, initialFormState);
  useResult(state, onDone);
  return (
    <form action={action} className="space-y-5" noValidate>
      <Hidden orgId={orgId} slug={slug} />
      <ErrorAlert state={state} slug={slug} />
      <FieldGroup>
        <TextField
          name="title"
          label="Title"
          placeholder="Shipping FAQ"
          defaultValue={state.values?.title}
          error={state.fieldErrors?.title}
          autoFocus
          required
        />
        <Field data-invalid={state.fieldErrors?.content ? true : undefined}>
          <FieldLabel htmlFor="content">Content</FieldLabel>
          <textarea
            id="content"
            name="content"
            rows={8}
            defaultValue={state.values?.content}
            placeholder="Paste an FAQ, a policy, or product details…"
            aria-invalid={state.fieldErrors?.content ? true : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
          />
          {state.fieldErrors?.content && <FieldError>{state.fieldErrors.content}</FieldError>}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <SubmitButton pendingText="Adding…">Add text</SubmitButton>
      </DialogFooter>
    </form>
  );
}
