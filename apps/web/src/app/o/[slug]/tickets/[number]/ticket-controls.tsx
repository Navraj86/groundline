"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
  type UpdateTicketInput,
} from "@groundline/shared";
import { SubmitButton } from "@/components/form-fields";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { initialFormState } from "@/lib/forms";
import { addNote, updateTicket } from "../actions";

type Ctx = { orgId: string; slug: string; number: number };
const UNASSIGNED = "__none";

export function TicketFields({
  ctx,
  status,
  priority,
  assigneeId,
  staff,
}: {
  ctx: Ctx;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId: string | null;
  staff: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const save = (input: UpdateTicketInput) =>
    start(async () => {
      const res = await updateTicket(ctx.orgId, ctx.slug, ctx.number, input);
      if (res.error) toast.error(res.error);
    });

  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel>Status</FieldLabel>
        <Select value={status} disabled={pending} onValueChange={(v) => save({ status: v as TicketStatus })}>
          <SelectTrigger className="w-full" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TICKET_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {TICKET_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Priority</FieldLabel>
        <Select value={priority} disabled={pending} onValueChange={(v) => save({ priority: v as TicketPriority })}>
          <SelectTrigger className="w-full" aria-label="Priority">
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
      <Field>
        <FieldLabel>Assignee</FieldLabel>
        <Select
          value={assigneeId ?? UNASSIGNED}
          disabled={pending}
          onValueChange={(v) => save({ assigneeId: v === UNASSIGNED ? null : v })}
        >
          <SelectTrigger className="w-full" aria-label="Assignee">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
            {staff.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

export function NoteForm({ ctx }: { ctx: Ctx }) {
  const [state, action] = useActionState(addNote, initialFormState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) ref.current?.reset();
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="orgId" value={ctx.orgId} />
      <input type="hidden" name="slug" value={ctx.slug} />
      <input type="hidden" name="number" value={ctx.number} />
      <textarea
        name="body"
        rows={3}
        required
        maxLength={5000}
        defaultValue={state.values?.body}
        placeholder="Add an internal note. Customers never see these."
        aria-label="Internal note"
        className="w-full rounded-md border border-input bg-amber-50/50 px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-amber-950/20"
      />
      <div className="flex justify-end">
        <SubmitButton size="sm" variant="outline" pendingText="Saving…">
          Add note
        </SubmitButton>
      </div>
    </form>
  );
}
