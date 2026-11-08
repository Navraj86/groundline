import { AlertTriangle, Bot, Clock, DollarSign, MessagesSquare, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission, type AnalyticsReport, type TicketSource } from "@groundline/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, ApiError } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { PageBody, PageHeader } from "../_components/page-header";
import { DailyChart } from "./daily-chart";
import { RangePicker } from "./range-picker";

export const metadata: Metadata = { title: "Analytics" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_LABEL: Record<TicketSource, string> = { AI: "By the assistant", CUSTOMER: "Customer asked", AGENT: "By the team" };

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const int = (v: number) => v.toLocaleString();
const secs = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`);
const usd = (v: number) => (v === 0 ? "$0" : v < 0.01 ? "<$0.01" : `$${v.toFixed(2)}`);
const tokens = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));

function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function AnalyticsPage({ params, searchParams }: PageProps<"/o/[slug]/analytics">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { org } = await requireOrg(slug);
  if (!hasPermission(org.role, "analytics:read")) notFound();

  const fallback = defaultRange();
  const from = typeof sp.from === "string" && DATE.test(sp.from) ? sp.from : fallback.from;
  const to = typeof sp.to === "string" && DATE.test(sp.to) ? sp.to : fallback.to;
  const tz = typeof sp.tz === "string" ? sp.tz : "UTC";

  let report: AnalyticsReport | null = null;
  let error: string | null = null;
  try {
    report = await api<AnalyticsReport>(`/orgs/${org.id}/analytics?${new URLSearchParams({ from, to, tz })}`);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 400) throw err;
    error = err.message;
  }

  return (
    <>
      <PageHeader
        title="Analytics"
        description="How much support the assistant handles, how fast, how well, and what it costs."
        actions={<RangePicker from={from} to={to} />}
      />
      <PageBody>
        {error || !report ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">{error ?? "No data."}</CardContent>
          </Card>
        ) : (
          <Report report={report} slug={org.slug} />
        )}
      </PageBody>
    </>
  );
}

function Report({ report: r, slug }: { report: AnalyticsReport; slug: string }) {
  const c = r.conversations;
  const tiles = [
    { label: "Conversations", value: int(c.total), hint: `${int(c.customerMessages)} customer messages`, icon: MessagesSquare },
    {
      label: "Resolved by AI",
      value: pct(c.resolutionRate),
      hint: `${int(c.aiResolved)} of ${int(c.aiEngaged)} the assistant answered`,
      icon: Bot,
    },
    { label: "Escalated", value: int(c.escalated), hint: c.total ? `${pct(c.escalated / c.total)} of conversations` : "No conversations", icon: Users },
    {
      label: "Median reply time",
      value: secs(r.answers.latency.p50Ms),
      hint: `90% within ${secs(r.answers.latency.p90Ms)}`,
      icon: Clock,
    },
    {
      label: "Estimated AI cost",
      value: usd(r.usage.estimatedCostUsd),
      hint: `${tokens(r.usage.inputTokens + r.usage.outputTokens + r.usage.qualityTokens)} tokens${r.usage.costIncomplete ? " · some models unpriced" : ""}`,
      icon: DollarSign,
    },
  ];
  const q = r.quality;
  const a = r.agent.approvals;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {tiles.map(({ label, value, hint, icon: Icon }) => (
          <Card key={label} className="gap-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardDescription>{label}</CardDescription>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conversations per day</CardTitle>
          <CardDescription>
            Website widget conversations by day ({r.range.tz.replace(/_/g, " ")}). Playground tests aren&apos;t counted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DailyChart data={r.daily} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Answers</CardTitle>
            <CardDescription>{int(r.answers.total)} assistant replies to customers</CardDescription>
          </CardHeader>
          <CardContent>
            <Stats
              rows={[
                ["Answered from the knowledge base or tools", int(r.answers.answered)],
                ["Not in the knowledge base", int(r.answers.insufficientContext)],
                ["Failed", int(r.answers.error)],
                ["Average reply time", secs(r.answers.latency.avgMs)],
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tickets</CardTitle>
            <CardDescription>
              {int(r.tickets.created)} created · {int(r.tickets.openNow)} open right now
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Stats
              rows={[
                ...(Object.keys(SOURCE_LABEL) as TicketSource[]).map((s): [string, string] => [SOURCE_LABEL[s], int(r.tickets.bySource[s])]),
                ["Resolved in this period", int(r.tickets.resolved)],
                [
                  "Median time to resolve",
                  r.tickets.medianResolutionHours === null ? "—" : `${r.tickets.medianResolutionHours.toFixed(1)} h`,
                ],
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Answer quality</CardTitle>
            <CardDescription>
              {q.reviewed ? `${int(q.reviewed)} answers checked against their sources` : "No answers checked yet"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Stats
              rows={[
                ["Average groundedness", pct(q.avgGroundedness)],
                ["Average relevance", pct(q.avgRelevance)],
                ["Flagged as possibly unsupported", int(q.flagged)],
              ]}
            />
            {q.recentFlagged.length > 0 && (
              <ul className="space-y-2">
                {q.recentFlagged.map((f) => (
                  <li key={f.messageId} className="rounded-lg border p-2 text-xs">
                    <Link href={`/o/${slug}/conversations/${f.conversationId}`} className="font-medium hover:underline">
                      <AlertTriangle className="mr-1 inline size-3.5 text-amber-600" aria-label="Flagged" />
                      {pct(f.groundedness)} grounded · {formatDateTime(f.createdAt)}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-muted-foreground">{f.unsupportedClaims[0] ?? f.excerpt}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Agent tools</CardTitle>
            <CardDescription>
              {int(r.agent.runs)} agent runs · {int(r.agent.failed)} failed · {r.agent.avgSteps ?? 0} tool steps on average
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {r.agent.tools.length === 0 ? (
              <p className="text-sm text-muted-foreground">The assistant didn&apos;t use any tools in this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Success</TableHead>
                    <TableHead className="text-right">Blocked</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.agent.tools.map((t) => (
                    <TableRow key={t.tool}>
                      <TableCell className="font-mono text-xs">{t.tool}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.total}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(t.successRate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.blocked}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.failed}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{a.approved} approved</Badge>
              <Badge variant="outline">{a.rejected} rejected</Badge>
              <Badge variant="outline">{a.expired} expired</Badge>
              {a.pending > 0 && <Badge>{a.pending} waiting</Badge>}
              {a.medianDecisionMinutes !== null && (
                <span className="self-center text-muted-foreground">Median decision in {a.medianDecisionMinutes} min</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI usage and cost</CardTitle>
            <CardDescription>
              Estimates from list prices, including playground tests. Quality checks used {tokens(r.usage.qualityTokens)} tokens.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {r.usage.byModel.length === 0 ? (
              <p className="text-sm text-muted-foreground">No AI usage in this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Replies</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.usage.byModel.map((m) => (
                    <TableRow key={`${m.provider}/${m.model}`}>
                      <TableCell>
                        <span className="font-mono text-xs">{m.model}</span>
                        {m.provider && <span className="ml-1 text-xs text-muted-foreground">({m.provider})</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{int(m.replies)}</TableCell>
                      <TableCell className="text-right tabular-nums">{tokens(m.inputTokens)}</TableCell>
                      <TableCell className="text-right tabular-nums">{tokens(m.outputTokens)}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.costUsd === null ? "Unpriced" : usd(m.costUsd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Stats({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
