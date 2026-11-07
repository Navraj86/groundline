"use server";

import { revalidatePath } from "next/cache";
import { addTextSourceSchema, addUrlSourceSchema } from "@groundline/shared";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import { formValues, zodFieldErrors, type FormState } from "@/lib/forms";

const ctx = z.object({ orgId: z.uuid(), slug: z.string().min(1) });

function failure(err: unknown, values?: Record<string, string>): FormState {
  if (err instanceof ApiError) {
    return { error: err.message, code: err.body.code, fieldErrors: err.fieldErrors, values };
  }
  throw err;
}

export async function uploadFile(_: FormState, formData: FormData): Promise<FormState> {
  const { orgId, slug } = ctx.parse({ orgId: formData.get("orgId"), slug: formData.get("slug") });
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { fieldErrors: { file: "Choose a file to upload" } };

  const body = new FormData();
  body.set("file", file, file.name);
  try {
    await api(`/orgs/${orgId}/knowledge/files`, { method: "POST", body });
  } catch (err) {
    return failure(err);
  }
  revalidatePath(`/o/${slug}/knowledge`);
  return { success: `Uploaded ${file.name}. Processing has started.` };
}

export async function addUrl(_: FormState, formData: FormData): Promise<FormState> {
  const { orgId, slug } = ctx.parse({ orgId: formData.get("orgId"), slug: formData.get("slug") });
  const values = formValues(formData, ["url"]);
  const parsed = addUrlSourceSchema.safeParse({ url: values.url.trim() });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error), values };
  try {
    await api(`/orgs/${orgId}/knowledge/urls`, { method: "POST", body: parsed.data });
  } catch (err) {
    return failure(err, values);
  }
  revalidatePath(`/o/${slug}/knowledge`);
  return { success: "Page added. We'll fetch and index it now." };
}

export async function addText(_: FormState, formData: FormData): Promise<FormState> {
  const { orgId, slug } = ctx.parse({ orgId: formData.get("orgId"), slug: formData.get("slug") });
  const values = formValues(formData, ["title", "content"]);
  const parsed = addTextSourceSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error), values };
  try {
    await api(`/orgs/${orgId}/knowledge/text`, { method: "POST", body: parsed.data });
  } catch (err) {
    return failure(err, values);
  }
  revalidatePath(`/o/${slug}/knowledge`);
  return { success: `Added “${parsed.data.title}”.` };
}

export async function reprocessSource(orgId: string, slug: string, sourceId: string): Promise<FormState> {
  try {
    await api(`/orgs/${ctx.shape.orgId.parse(orgId)}/knowledge/${sourceId}/reprocess`, { method: "POST" });
  } catch (err) {
    return failure(err);
  }
  revalidatePath(`/o/${slug}/knowledge`);
  return { success: "Reprocessing started." };
}

export async function deleteSource(orgId: string, slug: string, sourceId: string): Promise<FormState> {
  try {
    await api(`/orgs/${ctx.shape.orgId.parse(orgId)}/knowledge/${sourceId}`, { method: "DELETE" });
  } catch (err) {
    return failure(err);
  }
  revalidatePath(`/o/${slug}/knowledge`);
  return { success: "Source deleted. The assistant can no longer use it." };
}
