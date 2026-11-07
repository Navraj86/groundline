import type { Metadata } from "next";
import { hasPermission, type Organization } from "@groundline/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { PageBody, PageHeader } from "../_components/page-header";
import { OrgSettingsForm } from "./org-settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/o/[slug]/settings">) {
  const { slug } = await params;
  const { org: membership } = await requireOrg(slug);
  const org = await api<Organization>(`/orgs/${membership.id}`);
  const canEdit = hasPermission(org.role, "org:update");

  return (
    <>
      <PageHeader title="Settings" description="Manage how your workspace appears to your team." />
      <PageBody>
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>
              {canEdit
                ? `Created ${formatDate(org.createdAt)}.`
                : "Only workspace owners can change these settings."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OrgSettingsForm orgId={org.id} name={org.name} slug={org.slug} canEdit={canEdit} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>
              Plans, usage limits and invoices will live here once subscriptions launch.
            </CardDescription>
          </CardHeader>
        </Card>
      </PageBody>
    </>
  );
}
