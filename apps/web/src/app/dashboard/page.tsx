import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";

/** Entry point after sign-in: the user's first workspace, or onboarding if they have none. */
export default async function DashboardRedirect() {
  const me = await requireMe("/dashboard");
  const first = me.organizations[0];
  redirect(first ? `/o/${first.slug}` : "/onboarding");
}
