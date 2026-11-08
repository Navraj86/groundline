import { ArrowLeft, Bot, ExternalLink, UserRound, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GROUNDEDNESS_FLAG_THRESHOLD, hasPermission, type AnswerReview, type ChatMessage, type ConversationDetail, type ToolCallStatus } from "@groundline/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { renderAnswer } from "@/components/render-answer";
import { PageBody, PageHeader } from "../../_components/page-header";
import { STATUS_BADGE } from "../status";
import { LiveRefresh, ReplyBox, StatusButton } from "./conversation-controls";

export const metadata: Metadata = { title: "Conversation" };

const TOOL_STATUS: Record<ToolCallStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  SUCCEEDED: { label: "Done", variant: "secondary" },
  FAILED: { label: "Failed", variant: "destructive" },
  BLOCKED: { label: "Blocked", variant: "outline" },
  PENDING_APPROVAL: { label: "Awaiting approval", variant: "default" },
  REJECTED: { label: "Rejected", variant: "outline" },
};

const ANSWER_LABEL = {
  ANSWERED: null,
  INSUFFICIENT_CONTEXT: "Not in knowledge base",
  ERROR: "Couldn't answer",
} as const;

export default async function ConversationPage({ params }: PageProps<"/o/[slug]/conversations/[id]">) {
  const { slug, id } = await params;
  const { org } = await requireOrg(slug);
  if (!hasPermission(org.role, "conversations:read")) notFound();

  let conversation: ConversationDetail;
  try {
    conversation = await api<ConversationDetail>(`/orgs/${org.id}/conversations/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }

  const ids = { orgId: org.id, slug: org.slug, conversationId: conversation.id };
  const canReply = hasPermission(org.role, "conversations:reply");
  const badge = STATUS_BADGE[conversation.status];
  const totals = conversation.messages.reduce(
    (acc, m) => ({
      input: acc.input + (m.meta?.inputTokens ?? 0),
      output: acc.output + (m.meta?.outputTokens ?? 0),
    }),
    { input: 0, output: 0 },
  );

  return (
    <>
      <LiveRefresh active={conversation.status !== "RESOLVED"} />
      <PageHeader
        title={conversation.title ?? "Conversation"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {conversation.channel === "PLAYGROUND" && <Badge variant="outline">Test chat</Badge>}
            <span>Started {formatDateTime(conversation.createdAt)}</span>
          </span>
        }
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/o/${org.slug}/conversations`}>
                <ArrowLeft /> All conversations
              </Link>
            </Button>
            {canReply && <StatusButton {...ids} resolved={conversation.status === "RESOLVED"} />}
          </>
        }
      />
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <Card>
            <CardContent className="space-y-5">
              {conversation.messages.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No messages yet.</p>
              )}
              {conversation.messages.map((m) => (
                <MessageRow key={m.id} message={m} />
              ))}
              {canReply && conversation.status !== "RESOLVED" && (
                <div className="border-t pt-4">
                  <ReplyBox {...ids} />
                </div>
              )}
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Customer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  {conversation.visitorName ?? "Anonymous visitor"}{" "}
                  {conversation.verified && <Badge variant="secondary">Verified</Badge>}
                </p>
                <p className="text-muted-foreground">{conversation.visitorEmail ?? "No email shared"}</p>
              </CardContent>
            </Card>
            {conversation.toolCalls && conversation.toolCalls.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Agent activity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {conversation.toolCalls.map((t) => (
                    <div key={t.id} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{t.label}</span>
                        <Badge variant={TOOL_STATUS[t.status].variant}>{TOOL_STATUS[t.status].label}</Badge>
                      </div>
                      {Object.keys(t.input).length > 0 && (
                        <p className="truncate font-mono text-muted-foreground" title={JSON.stringify(t.input)}>
                          {JSON.stringify(t.input)}
                        </p>
                      )}
                      {t.error && <p className="text-muted-foreground">{t.error}</p>}
                      <p className="text-muted-foreground">
                        {formatDateTime(t.createdAt)}
                        {t.durationMs != null && ` · ${t.durationMs} ms`}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">AI usage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>
                  {totals.input.toLocaleString()} input · {totals.output.toLocaleString()} output tokens
                </p>
                {conversation.escalatedAt && <p>Handed to the team {formatDateTime(conversation.escalatedAt)}</p>}
                {conversation.resolvedAt && <p>Resolved {formatDateTime(conversation.resolvedAt)}</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  const who =
    message.role === "CUSTOMER"
      ? { icon: UserRound, label: "Customer" }
      : message.role === "AGENT"
        ? { icon: Users, label: "Team" }
        : { icon: Bot, label: "Assistant" };
  const flag = message.answerStatus ? ANSWER_LABEL[message.answerStatus] : null;

  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          message.role === "CUSTOMER" ? "bg-muted" : message.role === "AGENT" ? "bg-blue-100 text-blue-700" : "bg-foreground text-background",
        )}
      >
        <who.icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{who.label}</span>
          <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
          {flag && <Badge variant="outline">{flag}</Badge>}
          {message.meta?.model && (
            <span>
              {message.meta.provider}/{message.meta.model}
              {message.meta.latencyMs != null && ` · ${(message.meta.latencyMs / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>
        <div className="space-y-2 text-sm leading-relaxed">{renderAnswer(message.content)}</div>
        {message.meta?.review && <ReviewNote review={message.meta.review} />}
        {message.sources.length > 0 && (
          <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">Sources</p>
            {message.sources.map((s) => (
              <div key={s.index} className="text-xs">
                <p className="flex items-center gap-1.5 font-medium">
                  <span className="rounded bg-foreground/10 px-1">{s.index}</span>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                      {s.title} <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    s.title
                  )}
                  {s.pages.length > 0 && <span className="font-normal text-muted-foreground">p. {s.pages.join(", ")}</span>}
                </p>
                <p className="mt-0.5 line-clamp-2 text-muted-foreground">{s.snippet}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewNote({ review }: { review: AnswerReview }) {
  const flagged = review.groundedness < GROUNDEDNESS_FLAG_THRESHOLD;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <div
      className={cn(
        "space-y-1 rounded-lg border p-3 text-xs",
        flagged ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "text-muted-foreground",
      )}
    >
      <p className="font-medium">
        {flagged ? "Possible unsupported claims" : "Quality check passed"} · grounded {pct(review.groundedness)} · relevant{" "}
        {pct(review.relevance)}
      </p>
      {review.unsupportedClaims.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4">
          {review.unsupportedClaims.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {review.judge && <p className="opacity-70">Reviewed by {review.judge === "heuristic" ? "word-overlap check (no model configured)" : review.judge}</p>}
    </div>
  );
}
