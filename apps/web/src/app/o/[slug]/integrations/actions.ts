"use server";

import { revalidatePath } from "next/cache";
import { actionsApiIntegrationSchema, updateToolsSchema, type AgentToolName } from "@groundline/shared";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import { zodFieldErrors, type FormState } from "@/lib/forms";

const orgId = z.uuid();

async function call(slug: string, path: string, init: { method: "POST" | "PUT" | "DELETE" | "PATCH"; body?: unknown }): Promise<FormState> {
  try {
    await api(path, init);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, fieldErrors: err.fieldErrors };
    throw err;
  }
  revalidatePath(`/o/${slug}`, "layout");
  return { success: "Saved." };
}

export async function setSandbox(id: string, slug: string, enabled: boolean) {
  return call(slug, `/orgs/${orgId.parse(id)}/integrations/sandbox`, { method: "PUT", body: { enabled } });
}

export async function saveActionsApi(_: FormState, formData: FormData): Promise<FormState> {
  const id = orgId.parse(formData.get("orgId"));
  const slug = String(formData.get("slug"));
  const parsed = actionsApiIntegrationSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    baseUrl: String(formData.get("baseUrl") ?? "").trim(),
  });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error), values: { baseUrl: String(formData.get("baseUrl") ?? "") } };
  return call(slug, `/orgs/${id}/integrations/actions-api`, { method: "PUT", body: parsed.data });
}

export async function rotateActionsSecret(id: string, slug: string) {
  return call(slug, `/orgs/${orgId.parse(id)}/integrations/actions-api/rotate-secret`, { method: "POST" });
}

export async function rotateIdentitySecret(id: string, slug: string) {
  return call(slug, `/orgs/${orgId.parse(id)}/identity/rotate`, { method: "POST" });
}

export async function disableIdentity(id: string, slug: string) {
  return call(slug, `/orgs/${orgId.parse(id)}/identity`, { method: "DELETE" });
}

export async function setTool(id: string, slug: string, tool: AgentToolName, enabled: boolean) {
  const body = updateToolsSchema.parse({ tools: { [tool]: enabled } });
  return call(slug, `/orgs/${orgId.parse(id)}/agent/tools`, { method: "PATCH", body });
}
