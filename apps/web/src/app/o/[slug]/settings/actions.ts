"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateOrganizationSchema, type Organization } from "@groundline/shared";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import { formValues, zodFieldErrors, type FormState } from "@/lib/forms";

export async function updateOrganization(_: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["name", "slug"]);
  const orgId = z.uuid().parse(formData.get("orgId"));
  const currentSlug = String(formData.get("currentSlug"));
  const parsed = updateOrganizationSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error), values };

  let org: Organization;
  try {
    org = await api<Organization>(`/orgs/${orgId}`, { method: "PATCH", body: parsed.data });
  } catch (err) {
    if (err instanceof ApiError) {
      return err.status === 409
        ? { fieldErrors: { slug: err.message }, values }
        : { error: err.message, fieldErrors: err.fieldErrors, values };
    }
    throw err;
  }

  revalidatePath("/", "layout");
  if (org.slug !== currentSlug) redirect(`/o/${org.slug}/settings`);
  return { success: "Workspace updated.", values: { name: org.name, slug: org.slug } };
}
