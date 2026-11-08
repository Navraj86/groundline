"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTicketSchema, ticketNoteSchema, type TicketSummary, type UpdateTicketInput } from "@groundline/shared";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import { formValues, zodFieldErrors, type FormState } from "@/lib/forms";

const ctx = z.object({ orgId: z.uuid(), slug: z.string().min(1) });

function failure(err: unknown, values?: Record<string, string>): FormState {
  if (err instanceof ApiError) return { error: err.message, fieldErrors: err.fieldErrors, values };
  throw err;
}

export async function createTicket(_: FormState, formData: FormData): Promise<FormState> {
  const { orgId, slug } = ctx.parse({ orgId: formData.get("orgId"), slug: formData.get("slug") });
  const values = formValues(formData, ["subject", "description", "priority"]);
  const parsed = createTicketSchema.safeParse({
    subject: values.subject,
    description: values.description || undefined,
    priority: values.priority || "NORMAL",
  });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error), values };
  let ticket: TicketSummary;
  try {
    ticket = await api<TicketSummary>(`/orgs/${orgId}/tickets`, { method: "POST", body: parsed.data });
  } catch (err) {
    return failure(err, values);
  }
  redirect(`/o/${slug}/tickets/${ticket.number}`);
}

export async function updateTicket(orgId: string, slug: string, number: number, input: UpdateTicketInput): Promise<FormState> {
  try {
    await api(`/orgs/${ctx.shape.orgId.parse(orgId)}/tickets/${number}`, { method: "PATCH", body: input });
  } catch (err) {
    return failure(err);
  }
  revalidatePath(`/o/${slug}/tickets`, "layout");
  return { success: "Ticket updated." };
}

export async function addNote(_: FormState, formData: FormData): Promise<FormState> {
  const { orgId, slug } = ctx.parse({ orgId: formData.get("orgId"), slug: formData.get("slug") });
  const number = z.coerce.number().int().positive().parse(formData.get("number"));
  const parsed = ticketNoteSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  try {
    await api(`/orgs/${orgId}/tickets/${number}/notes`, { method: "POST", body: parsed.data });
  } catch (err) {
    return failure(err, { body: String(formData.get("body") ?? "") });
  }
  revalidatePath(`/o/${slug}/tickets/${number}`);
  return { success: "Note added." };
}
