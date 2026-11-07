"use server";

import { revalidatePath } from "next/cache";
import { updateProfileSchema } from "@groundline/shared";
import { api, ApiError } from "@/lib/api";
import { formValues, zodFieldErrors, type FormState } from "@/lib/forms";

export async function updateProfile(_: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["fullName"]);
  const parsed = updateProfileSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error), values };

  try {
    await api("/me", { method: "PATCH", body: parsed.data });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, values };
    throw err;
  }
  revalidatePath("/", "layout");
  return { success: "Profile updated.", values };
}
