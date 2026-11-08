import { Ticket as TicketIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  hasPermission,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  type Paginated,
  type TicketStatus,
  type TicketSummary,
} from "@groundline/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "../_components/page-header";
import { PRIORITY_CLASS, STATUS_VARIANT } from "./labels";
import { NewTicketDialog } from "./new-ticket-dialog";

export const metadata: Metadata = { title: "Tickets" };

export default async function TicketsPage({ params, searchParams }: PageProps<"/o/[slug]/tickets">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { org } = await requireOrg(slug);
  if (!hasPermission(org.role, "tickets:manage")) notFound();

  const status = TICKET_STATUSES.find((s) => s === sp.status);
  const assignee = sp.assignee === "me" || sp.assignee === "unassigned" ? sp.assignee : undefined;
  const query = new URLSearchParams({ limit: "25" });
  if (status) query.set("status", status);
  if (assignee) query.set("assignee", assignee);
  if (typeof sp.cursor === "string") query.set("cursor", sp.cursor);
  const page = await api<Paginated<TicketSummary>>(`/orgs/${org.id}/tickets?${query}`);

  const base = `/o/${org.slug}/tickets`;
  const link = (next: { status?: TicketStatus; assignee?: string }) => {
    const q = new URLSearchParams();
    if (next.status) q.set("status", next.status);
    if (next.assignee) q.set("assignee", next.assignee);
    return q.size ? `${base}?${q}` : base;
  };

  return (
    <>
      <PageHeader
        title="Tickets"
        description="Requests your team is working on: handoffs from the assistant and anything you log yourself."
        actions={<NewTicketDialog orgId={org.id} slug={org.slug} />}
      />
      <PageBody>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant={!status ? "default" : "outline"}>
            <Link href={link({ assignee })}>All</Link>
          </Button>
          {TICKET_STATUSES.map((s) => (
            <Button key={s} asChild size="sm" variant={status === s ? "default" : "outline"}>
              <Link href={link({ status: s, assignee })}>{TICKET_STATUS_LABELS[s]}</Link>
            </Button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          <Button asChild size="sm" variant={assignee === "me" ? "default" : "ghost"}>
            <Link href={link({ status, assignee: assignee === "me" ? undefined : "me" })}>Assigned to me</Link>
          </Button>
          <Button asChild size="sm" variant={assignee === "unassigned" ? "default" : "ghost"}>
            <Link href={link({ status, assignee: assignee === "unassigned" ? undefined : "unassigned" })}>Unassigned</Link>
          </Button>
        </div>

        {page.items.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-3">
              <TicketIcon className="size-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">No tickets here</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              When a customer asks for a person, or the assistant can&apos;t resolve something, a ticket appears here.
            </p>
          </div>
        ) : (
          <Card className="py-0">
            <CardContent className="divide-y px-0">
              {page.items.map((t) => (
                <Link key={t.id} href={`${base}/${t.number}`} className="flex items-center gap-4 px-6 py-4 transition hover:bg-muted/50">
                  <span className="w-14 shrink-0 font-mono text-sm text-muted-foreground">#{t.number}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.customer?.name ?? t.customer?.email ?? t.contactEmail ?? "Unknown customer"}
                      {" · "}
                      {t.assignee ? `Assigned to ${t.assignee.fullName ?? t.assignee.email}` : "Unassigned"}
                    </p>
                  </div>
                  <span className={cn("hidden w-16 text-xs sm:block", PRIORITY_CLASS[t.priority])}>
                    {TICKET_PRIORITY_LABELS[t.priority]}
                  </span>
                  <Badge variant={STATUS_VARIANT[t.status]} className="w-24 justify-center">
                    {TICKET_STATUS_LABELS[t.status]}
                  </Badge>
                  <time className="hidden w-24 text-right text-xs text-muted-foreground md:block" dateTime={t.updatedAt}>
                    {formatRelative(t.updatedAt)}
                  </time>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
        {page.nextCursor && (
          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link href={`${link({ status, assignee })}${status || assignee ? "&" : "?"}cursor=${page.nextCursor}`}>Older</Link>
            </Button>
          </div>
        )}
      </PageBody>
    </>
  );
}
