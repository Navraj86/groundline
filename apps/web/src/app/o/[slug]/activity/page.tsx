import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission, type AuditLogEntry, type Paginated } from "@groundline/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { ActivityList } from "../_components/activity-list";
import { PageBody, PageHeader } from "../_components/page-header";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({ params, searchParams }: PageProps<"/o/[slug]/activity">) {
  const { slug } = await params;
  const { cursor } = await searchParams;
  const { org } = await requireOrg(slug);
  if (!hasPermission(org.role, "audit:read")) notFound();

  const query = new URLSearchParams({ limit: "25" });
  if (typeof cursor === "string") query.set("cursor", cursor);
  const page = await api<Paginated<AuditLogEntry>>(`/orgs/${org.id}/audit-logs?${query}`);

  return (
    <>
      <PageHeader
        title="Activity"
        description="An audit trail of administrative changes in this workspace."
      />
      <PageBody>
        <Card>
          <CardContent>
            <ActivityList items={page.items} />
          </CardContent>
        </Card>
        <div className="flex justify-end gap-2">
          {cursor && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/o/${org.slug}/activity`}>Newest</Link>
            </Button>
          )}
          {page.nextCursor && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/o/${org.slug}/activity?cursor=${page.nextCursor}`}>Older</Link>
            </Button>
          )}
        </div>
      </PageBody>
    </>
  );
}
