"use server";

import { revalidatePath } from "next/cache";
import { sendMessageSchema } from "@groundline/shared";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import { zodFieldErrors, type FormState } from "@/lib/forms";

const ids = z.object({ orgId: z.uuid(), slug: z.string().min(1), conversationId: z.uuid() });

export async function replyToConversation(_: FormState, formData: FormData): Promise<FormState> {
  const { orgId, slug, conversationId } = ids.parse({
    orgId: formData.get("orgId"),
    slug: formData.get("slug"),
    conversationId: formData.get("conversationId"),
  });
  const parsed = sendMessageSchema.safeParse({ content: formData.get("content") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  try {
    await api(`/orgs/${orgId}/conversations/${conversationId}/messages`, { method: "POST", body: parsed.data });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, values: { content: String(formData.get("content")) } };
    throw err;
  }
  revalidatePath(`/o/${slug}/conversations`, "layout");
  return { success: "sent" };
}

export async function setConversationStatus(
  orgId: string,
  slug: string,
  conversationId: string,
  status: "OPEN" | "RESOLVED",
): Promise<FormState> {
  try {
    const parsed = ids.parse({ orgId, slug, conversationId });
    await api(`/orgs/${parsed.orgId}/conversations/${parsed.conversationId}`, { method: "PATCH", body: { status } });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/o/${slug}/conversations`, "layout");
  return { success: status === "RESOLVED" ? "Marked as resolved." : "Reopened." };
}
