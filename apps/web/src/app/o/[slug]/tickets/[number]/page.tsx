import { ArrowLeft, MessagesSquare, StickyNote } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  hasPermission,
  TICKET_PRIORITY_LABELS,
  TICKET_SOURCE_LABELS,
  TICKET_STATUS_LABELS,
  type Member,
  type TicketDetail,
  type TicketEventView,
  type TicketPriority,
  type TicketStatus,
} from "@groundline/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { formatDateTime, formatRelative } from "@/lib/format";
import { PageBody, PageHeader } from "../../_components/page-header";
import { STATUS_VARIANT } from "../labels";
import { NoteForm, TicketFields } from "./ticket-controls";

export async function generateMetadata({ params }: PageProps<"/o/[slug]/tickets/[number]">): Promise<Metadata> {
  return { title: `Ticket #${(await params).number}` };
}

export default async function TicketPage({ params }: PageProps<"/o/[slug]/tickets/[number]">) {
  const { slug, number: raw } = await params;
  const number = Number(raw);
  const { org } = await requireOrg(slug);
  if (!hasPermission(org.role, "tickets:manage") || !Number.isInteger(number) || number < 1) notFound();

  let ticket: TicketDetail;
  try {
    ticket = await api<TicketDetail>(`/orgs/${org.id}/tickets/${number}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const members = await api<Member[]>(`/orgs/${org.id}/members`);
  const staff = members
    .filter((m) => hasPermission(m.role, "tickets:manage"))
    .map((m) => ({ id: m.user.id, name: m.user.fullName ?? m.user.email }));
  const names = new Map(members.map((m) => [m.user.id, m.user.fullName ?? m.user.email]));
  const ctx = { orgId: org.id, slug: org.slug, number };

  return (
    <>
      <PageHeader
        title={`#${ticket.number} ${ticket.subject}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[ticket.status]}>{TICKET_STATUS_LABELS[ticket.status]}</Badge>
            <span>{TICKET_SOURCE_LABELS[ticket.source]}</span>
            <span>· opened {formatRelative(ticket.createdAt)}</span>
          </span>
        }
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href={`/o/${org.slug}/tickets`}>
              <ArrowLeft /> All tickets
            </Link>
          </Button>
        }
      />
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p className="whitespace-pre-line">{ticket.description || "No description."}</p>
                {ticket.conversationId && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/o/${org.slug}/conversations/${ticket.conversationId}`}>
                      <MessagesSquare /> Open the conversation
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="space-y-3">
                  {ticket.events.map((e) => (
                    <EventRow key={e.id} event={e} names={names} />
                  ))}
                </ol>
                <NoteForm ctx={ctx} />
              </CardContent>
            </Card>
          </div>
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-0">
                <TicketFields
                  ctx={ctx}
                  status={ticket.status}
                  priority={ticket.priority}
                  assigneeId={ticket.assignee?.id ?? null}
                  staff={staff}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Customer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>{ticket.customer?.name ?? "Unknown"}</p>
                <p className="text-muted-foreground">{ticket.customer?.email ?? ticket.contactEmail ?? "No email"}</p>
                {ticket.customer && (
                  <p className="text-xs text-muted-foreground">
                    Verified · ID <span className="font-mono">{ticket.customer.externalId}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function EventRow({ event, names }: { event: TicketEventView; names: Map<string, string> }) {
  const who = event.actor?.fullName ?? event.actor?.email ?? "Groundline";
  const d = event.data as { from?: string | null; to?: string | null; body?: string };
  const person = (id: string | null | undefined) => (id ? (names.get(id) ?? "a former member") : "nobody");
  let text: string;
  switch (event.type) {
    case "CREATED":
      text = "opened the ticket";
      break;
    case "STATUS_CHANGED":
      text = `changed status from ${TICKET_STATUS_LABELS[d.from as TicketStatus]} to ${TICKET_STATUS_LABELS[d.to as TicketStatus]}`;
      break;
    case "PRIORITY_CHANGED":
      text = `changed priority from ${TICKET_PRIORITY_LABELS[d.from as TicketPriority]} to ${TICKET_PRIORITY_LABELS[d.to as TicketPriority]}`;
      break;
    case "ASSIGNED":
      text = d.to ? `assigned the ticket to ${person(d.to)}` : "unassigned the ticket";
      break;
    case "NOTE":
      text = "added a note";
      break;
  }
  return (
    <li className="text-sm">
      <p>
        <span className="font-medium">{who}</span> {text}{" "}
        <time className="text-xs text-muted-foreground" dateTime={event.createdAt} title={formatDateTime(event.createdAt)}>
          {formatRelative(event.createdAt)}
        </time>
      </p>
      {event.type === "NOTE" && d.body && (
        <div className="mt-1.5 flex gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-2.5 dark:border-amber-900 dark:bg-amber-950/20">
          <StickyNote className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
          <p className="whitespace-pre-line">{d.body}</p>
        </div>
      )}
    </li>
  );
}
