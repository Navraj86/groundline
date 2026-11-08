"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { TICKET_PRIORITIES, TICKET_PRIORITY_LABELS, type TicketPriority } from "@groundline/shared";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { initialFormState } from "@/lib/forms";
import { createTicket } from "./actions";

export function NewTicketDialog({ orgId, slug }: { orgId: string; slug: string }) {
  const [state, action] = useActionState(createTicket, initialFormState);
  const [priority, setPriority] = useState<TicketPriority>("NORMAL");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
          <DialogDescription>For requests that came in by phone, email or anywhere else.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-5" noValidate>
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="priority" value={priority} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <TextField name="subject" label="Subject" defaultValue={state.values?.subject} error={state.fieldErrors?.subject} autoFocus required />
            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <textarea
                id="description"
                name="description"
                rows={4}
                defaultValue={state.values?.description}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="priority">Priority</FieldLabel>
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                <SelectTrigger id="priority" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {TICKET_PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <SubmitButton pendingText="Creating…">Create ticket</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
