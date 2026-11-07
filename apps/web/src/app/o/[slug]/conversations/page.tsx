import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CONVERSATION_STATUSES,
  hasPermission,
  type ConversationStatus,
  type ConversationSummary,
  type Paginated,
} from "@groundline/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "../_components/page-header";
import { STATUS_BADGE } from "./status";

export const metadata: Metadata = { title: "Conversations" };

const FILTERS: { label: string; status?: ConversationStatus }[] = [
  { label: "All" },
  { label: "Needs a human", status: "ESCALATED" },
  { label: "AI handling", status: "OPEN" },
  { label: "Resolved", status: "RESOLVED" },
];

export default async function ConversationsPage({ params, searchParams }: PageProps<"/o/[slug]/conversations">) {
  const { slug } = await params;
  const { status: statusParam, cursor } = await searchParams;
  const { org } = await requireOrg(slug);
  if (!hasPermission(org.role, "conversations:read")) notFound();

  const status = CONVERSATION_STATUSES.find((s) => s === statusParam);
  const query = new URLSearchParams({ limit: "25" });
  if (status) query.set("status", status);
  if (typeof cursor === "string") query.set("cursor", cursor);
  const page = await api<Paginated<ConversationSummary>>(`/orgs/${org.id}/conversations?${query}`);
  const base = `/o/${org.slug}/conversations`;

  return (
    <>
      <PageHeader title="Conversations" description="Every chat between your customers, the assistant and your team." />
      <PageBody>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button key={f.label} asChild size="sm" variant={f.status === status ? "default" : "outline"}>
              <Link href={f.status ? `${base}?status=${f.status}` : base}>{f.label}</Link>
            </Button>
          ))}
        </div>
        {page.items.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-3">
              <MessagesSquare className="size-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">No conversations yet</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Add the chat widget to your site from the Assistant page, or try it there yourself.
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link href={`/o/${org.slug}/assistant`}>Open assistant settings</Link>
            </Button>
          </div>
        ) : (
          <Card className="py-0">
            <CardContent className="divide-y px-0">
              {page.items.map((c) => {
                const badge = STATUS_BADGE[c.status];
                return (
                  <Link
                    key={c.id}
                    href={`${base}/${c.id}`}
                    className="flex items-start gap-4 px-6 py-4 transition hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{c.title ?? "New conversation"}</p>
                        {c.channel === "PLAYGROUND" && <Badge variant="outline">Test</Badge>}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {c.lastMessage
                          ? `${c.lastMessage.role === "CUSTOMER" ? "Customer" : c.lastMessage.role === "AGENT" ? "Team" : "Assistant"}: ${c.lastMessage.content}`
                          : "No messages"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.visitorEmail ?? c.visitorName ?? "Anonymous visitor"} · {c.messageCount} messages
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      <time className={cn("text-xs text-muted-foreground")} dateTime={c.lastMessageAt}>
                        {formatRelative(c.lastMessageAt)}
                      </time>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        )}
        <div className="flex justify-end gap-2">
          {cursor && (
            <Button asChild variant="outline" size="sm">
              <Link href={status ? `${base}?status=${status}` : base}>Newest</Link>
            </Button>
          )}
          {page.nextCursor && (
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}?${new URLSearchParams({ ...(status ? { status } : {}), cursor: page.nextCursor })}`}>
                Older
              </Link>
            </Button>
          )}
        </div>
      </PageBody>
    </>
  );
}
