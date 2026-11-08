import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { Me, OrganizationSummary } from "@groundline/shared";
import { api, ApiError } from "./api";

/** The signed-in user, or null. Deduplicated per request. */
export const getMe = cache(async (): Promise<Me | null> => {
  try {
    return await api<Me>("/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
});

/** The signed-in user; redirects to the login page when there is no valid session. */
export async function requireMe(next?: string): Promise<Me> {
  const me = await getMe();
  // Through /auth/expired, which clears a session cookie the API rejected (see that route).
  if (!me) redirect(next ? `/auth/expired?next=${encodeURIComponent(next)}` : "/auth/expired");
  return me;
}

/** The caller's membership in the organization with this slug; 404 when they have none. */
export async function requireOrg(slug: string): Promise<{ me: Me; org: OrganizationSummary }> {
  const me = await requireMe(`/o/${slug}`);
  const org = me.organizations.find((o) => o.slug === slug);
  if (!org) notFound();
  return { me, org };
}
