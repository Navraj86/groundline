"use server";

import { redirect } from "next/navigation";
import { createOrganizationSchema, type Organization } from "@groundline/shared";
import { api, ApiError } from "@/lib/api";
import { formValues, zodFieldErrors, type FormState } from "@/lib/forms";

export async function createOrganization(_: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["name", "slug"]);
  const parsed = createOrganizationSchema.safeParse({
    name: formData.get("name"),
    slug: values.slug.trim() ? values.slug : undefined,
  });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error), values };

  let org: Organization;
  try {
    org = await api<Organization>("/orgs", { method: "POST", body: parsed.data });
  } catch (err) {
    if (err instanceof ApiError) {
      const isSlugConflict = err.status === 409;
      return {
        error: isSlugConflict ? undefined : err.message,
        fieldErrors: isSlugConflict ? { slug: err.message } : err.fieldErrors,
        values,
      };
    }
    throw err;
  }
  redirect(`/o/${org.slug}`);
}
