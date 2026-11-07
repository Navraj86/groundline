"use server";

import { revalidatePath } from "next/cache";
import { assistantSettingsSchema } from "@groundline/shared";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import { formValues, zodFieldErrors, type FormState } from "@/lib/forms";

const ctx = z.object({ orgId: z.uuid(), slug: z.string().min(1) });

export async function saveAssistant(_: FormState, formData: FormData): Promise<FormState> {
  const { orgId, slug } = ctx.parse({ orgId: formData.get("orgId"), slug: formData.get("slug") });
  const values = formValues(formData, ["name", "greeting", "instructions", "brandColor"]);
  const parsed = assistantSettingsSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error), values };
  try {
    await api(`/orgs/${orgId}/assistant`, { method: "PATCH", body: parsed.data });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, fieldErrors: err.fieldErrors, values };
    throw err;
  }
  revalidatePath(`/o/${slug}/assistant`);
  return { success: "Assistant updated.", values };
}

export async function rotateWidgetKey(orgId: string, slug: string): Promise<FormState> {
  try {
    await api(`/orgs/${ctx.shape.orgId.parse(orgId)}/assistant/rotate-key`, { method: "POST" });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/o/${slug}/assistant`);
  return { success: "New widget key issued. Update the snippet on your site." };
}
