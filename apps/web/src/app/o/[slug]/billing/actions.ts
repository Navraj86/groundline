"use server";

import { revalidatePath } from "next/cache";
import type {
  BillingActionResult,
  BillingOverview,
  CheckoutResult,
  PortalResult,
} from "@groundline/shared";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";

export type BillingActionState = { error?: string; message?: string; redirectUrl?: string };

const orgId = z.uuid();

function failure(err: unknown): BillingActionState {
  if (err instanceof ApiError) return { error: err.message };
  throw err;
}

export async function startCheckout(id: string, planKey: string): Promise<BillingActionState> {
  try {
    const res = await api<CheckoutResult>(`/orgs/${orgId.parse(id)}/billing/checkout`, {
      method: "POST",
      body: { planKey },
    });
    return { redirectUrl: res.checkoutUrl };
  } catch (err) {
    return failure(err);
  }
}

export async function changePlan(id: string, slug: string, planKey: string): Promise<BillingActionState> {
  try {
    const res = await api<BillingActionResult>(`/orgs/${orgId.parse(id)}/billing/change-plan`, {
      method: "POST",
      body: { planKey },
    });
    revalidatePath(`/o/${slug}`, "layout");
    return { message: res.message };
  } catch (err) {
    return failure(err);
  }
}

export async function setCancellation(id: string, slug: string, cancel: boolean): Promise<BillingActionState> {
  try {
    const res = await api<BillingActionResult>(
      `/orgs/${orgId.parse(id)}/billing/${cancel ? "cancel" : "resume"}`,
      { method: "POST" },
    );
    revalidatePath(`/o/${slug}`, "layout");
    return { message: res.message };
  } catch (err) {
    return failure(err);
  }
}

export async function openPortal(id: string): Promise<BillingActionState> {
  try {
    const res = await api<PortalResult>(`/orgs/${orgId.parse(id)}/billing/portal`, { method: "POST" });
    return { redirectUrl: res.url };
  } catch (err) {
    return failure(err);
  }
}

/** Pulls the latest subscription state from the provider, e.g. right after checkout. */
export async function syncBilling(id: string, slug: string): Promise<BillingActionState & { planName?: string }> {
  try {
    const overview = await api<BillingOverview>(`/orgs/${orgId.parse(id)}/billing/sync`, { method: "POST" });
    revalidatePath(`/o/${slug}`, "layout");
    return { planName: overview.plan.name };
  } catch (err) {
    return failure(err);
  }
}
