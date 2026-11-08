import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission, type ApprovalStatus, type ApprovalView, type Paginated } from "@groundline/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { formatDateTime, formatRelative } from "@/lib/format";
import { PageBody, PageHeader } from "../_components/page-header";
import { DecisionButtons } from "./decision-buttons";

export const metadata: Metadata = { title: "Approvals" };

const STATUS: Record<ApprovalStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  PENDING: { label: "Waiting for review", variant: "default" },
  APPROVED: { label: "Approved", variant: "secondary" },
  REJECTED: { label: "Rejected", variant: "outline" },
  EXPIRED: { label: "Expired", variant: "outline" },
};

export default async function ApprovalsPage({ params, searchParams }: PageProps<"/o/[slug]/approvals">) {
  const { slug } = await params;
  const { view } = await searchParams;
  const { org } = await requireOrg(slug);
  if (!hasPermission(org.role, "approvals:read")) notFound();

  const history = view === "history";
  const page = await api<Paginated<ApprovalView>>(
    `/orgs/${org.id}/approvals?limit=50${history ? "" : "&status=PENDING"}`,
  );
  const items = history ? page.items.filter((a) => a.status !== "PENDING") : page.items;
  const canDecide = hasPermission(org.role, "approvals:decide");
  const base = `/o/${org.slug}/approvals`;

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Refunds, cancellations and other sensitive actions the assistant prepared. Nothing runs until an owner or admin approves it."
      />
      <PageBody>
        <div className="flex gap-2">
          <Button asChild size="sm" variant={history ? "outline" : "default"}>
            <Link href={base}>Pending</Link>
          </Button>
          <Button asChild size="sm" variant={history ? "default" : "outline"}>
            <Link href={`${base}?view=history`}>History</Link>
          </Button>
        </div>
        {!canDecide && !history && (
          <p className="text-sm text-muted-foreground">Only owners and admins can approve or reject these.</p>
        )}
        {items.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-3">
              <ShieldCheck className="size-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">{history ? "No decisions yet" : "Nothing waiting for review"}</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              When a signed-in customer asks for a refund or cancellation, the request waits here for approval.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((a) => (
              <Card key={a.id}>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={STATUS[a.status].variant}>{STATUS[a.status].label}</Badge>
                        <span className="text-xs text-muted-foreground">{a.toolLabel}</span>
                      </div>
                      <p className="font-medium">{a.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        For {a.customer?.name ?? a.customer?.email ?? "an unknown customer"}
                        {a.customer && <> (ID <span className="font-mono">{a.customer.externalId}</span>)</>}
                        {" · requested "}
                        {formatRelative(a.createdAt)}
                        {a.status === "PENDING" && ` · expires ${formatDateTime(a.expiresAt)}`}
                      </p>
                    </div>
                    {a.status === "PENDING" && canDecide && (
                      <DecisionButtons orgId={org.id} slug={org.slug} approvalId={a.id} summary={a.summary} />
                    )}
                  </div>
                  {a.status !== "PENDING" && (
                    <p className="text-sm text-muted-foreground">
                      {a.decidedBy ? `${a.decidedBy.fullName ?? a.decidedBy.email} ${a.status.toLowerCase()} this ${formatRelative(a.decidedAt!)}` : "Expired without review"}
                      {a.decisionNote && ` — “${a.decisionNote}”`}
                      {a.status === "APPROVED" && (a.result.status === "SUCCEEDED" ? ". Completed." : `. Failed: ${a.result.error}`)}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {a.conversationId && (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/o/${org.slug}/conversations/${a.conversationId}`}>View conversation</Link>
                      </Button>
                    )}
                    {a.ticketNumber && (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/o/${org.slug}/tickets/${a.ticketNumber}`}>Ticket #{a.ticketNumber}</Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
