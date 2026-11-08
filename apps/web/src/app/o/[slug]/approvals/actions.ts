"use server";

import { revalidatePath } from "next/cache";
import { decideApprovalSchema, type ApprovalView } from "@groundline/shared";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";

export async function decideApproval(
  orgId: string,
  slug: string,
  approvalId: string,
  decision: "APPROVE" | "REJECT",
  note?: string,
): Promise<{ error?: string; result?: ApprovalView }> {
  const body = decideApprovalSchema.parse({ decision, note: note?.trim() || undefined });
  try {
    const result = await api<ApprovalView>(
      `/orgs/${z.uuid().parse(orgId)}/approvals/${z.uuid().parse(approvalId)}/decision`,
      { method: "POST", body },
    );
    revalidatePath(`/o/${slug}`, "layout");
    return { result };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
}
