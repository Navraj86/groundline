"use server";

import { redirect } from "next/navigation";
import type { AcceptInvitationResult } from "@groundline/shared";
import { api, ApiError } from "@/lib/api";
import type { FormState } from "@/lib/forms";

export async function acceptInvitation(token: string): Promise<FormState> {
  let result: AcceptInvitationResult;
  try {
    result = await api<AcceptInvitationResult>(`/invitations/${encodeURIComponent(token)}/accept`, {
      method: "POST",
    });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
  redirect(`/o/${result.organization.slug}`);
}
