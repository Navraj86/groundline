"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { inviteMemberSchema, orgRoleSchema } from "@groundline/shared";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import { formValues, zodFieldErrors, type FormState } from "@/lib/forms";

const ids = z.object({ orgId: z.uuid(), slug: z.string().min(1) });

function toState(err: unknown): FormState {
  if (err instanceof ApiError) return { error: err.message, fieldErrors: err.fieldErrors };
  throw err;
}

export async function inviteMember(_: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["email", "role"]);
  const { orgId, slug } = ids.parse({ orgId: formData.get("orgId"), slug: formData.get("slug") });
  const parsed = inviteMemberSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error), values };

  try {
    const res = await api<{ emailSent: boolean }>(`/orgs/${orgId}/invitations`, { method: "POST", body: parsed.data });
    revalidatePath(`/o/${slug}`, "layout");
    return {
      success: res.emailSent
        ? `Invitation sent to ${parsed.data.email}.`
        : `Invitation created, but the email to ${parsed.data.email} couldn't be sent. Try resending it.`,
    };
  } catch (err) {
    return { ...toState(err), values };
  }
}

export async function changeMemberRole(orgId: string, slug: string, memberId: string, role: string): Promise<FormState> {
  try {
    await api(`/orgs/${orgId}/members/${memberId}`, { method: "PATCH", body: { role: orgRoleSchema.parse(role) } });
    revalidatePath(`/o/${slug}`, "layout");
    return { success: "Role updated." };
  } catch (err) {
    return toState(err);
  }
}

export async function removeMember(orgId: string, slug: string, memberId: string, isSelf: boolean): Promise<FormState> {
  try {
    await api(`/orgs/${orgId}/members/${memberId}`, { method: "DELETE" });
  } catch (err) {
    return toState(err);
  }
  if (isSelf) redirect("/dashboard");
  revalidatePath(`/o/${slug}`, "layout");
  return { success: "Member removed." };
}

export async function revokeInvitation(orgId: string, slug: string, invitationId: string): Promise<FormState> {
  try {
    await api(`/orgs/${orgId}/invitations/${invitationId}`, { method: "DELETE" });
    revalidatePath(`/o/${slug}`, "layout");
    return { success: "Invitation cancelled." };
  } catch (err) {
    return toState(err);
  }
}

export async function resendInvitation(orgId: string, slug: string, email: string, role: string): Promise<FormState> {
  // Re-inviting replaces the pending invitation with a fresh link.
  try {
    await api(`/orgs/${orgId}/invitations`, { method: "POST", body: { email, role: orgRoleSchema.parse(role) } });
    revalidatePath(`/o/${slug}`, "layout");
    return { success: `Invitation resent to ${email}.` };
  } catch (err) {
    return toState(err);
  }
}
