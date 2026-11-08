import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission, type EvalResultView, type EvalRunDetail } from "@groundline/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveRefresh } from "@/components/live-refresh";
import { api, ApiError } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "../../../_components/page-header";
import { CancelRunButton } from "../../evaluations-client";
import { pct, RunStatusBadge } from "../../shared";

export const metadata: Metadata = { title: "Evaluation run" };

const STATUS_LABEL: Record<string, string> = {
  ANSWERED: "Answered",
  INSUFFICIENT_CONTEXT: "Declined",
  ERROR: "Error",
};

export default async function RunPage({ params }: PageProps<"/o/[slug]/evaluations/runs/[runId]">) {
  const { slug, runId } = await params;
  const { org } = await requireOrg(slug);
  if (!hasPermission(org.role, "evaluations:read")) notFound();

  let run: EvalRunDetail;
  try {
    run = await api<EvalRunDetail>(`/orgs/${org.id}/evaluations/runs/${runId}`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  const active = run.status === "QUEUED" || run.status === "RUNNING";
  const m = run.metrics;
  const failedFirst = [...run.results].sort((a, b) => Number(a.passed) - Number(b.passed));

  const tiles = [
    { label: "Passed", value: m ? pct(m.passRate) : `${run.passedCases}/${run.completedCases}`, hint: `${run.passedCases} of ${run.totalCases} questions` },
    { label: "Grounded in sources", value: pct(m?.avgGroundedness), hint: m?.hallucinationRate != null ? `${pct(m.hallucinationRate)} had unsupported claims` : "No answers graded" },
    { label: "Relevant", value: pct(m?.avgRelevance), hint: m?.avgCorrectness != null ? `${pct(m.avgCorrectness)} matched the expected answer` : "No expected answers given" },
    { label: "Retrieval", value: pct(m?.retrievalHitRate), hint: m?.meanReciprocalRank != null ? `MRR ${m.meanReciprocalRank.toFixed(2)}` : "No expected sources given" },
    { label: "Declined correctly", value: pct(m?.declineAccuracy), hint: m ? `${m.insufficient} declined · ${m.errors} errors` : "—" },
  ];

  return (
    <>
      <LiveRefresh active={active} />
      <PageHeader
        title={`${run.datasetName} · run`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <RunStatusBadge run={run} />
            <span>Started {formatDateTime(run.createdAt)}</span>
            {run.createdBy && <span>by {run.createdBy.fullName ?? run.createdBy.email}</span>}
          </span>
        }
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link href={`/o/${org.slug}/evaluations/${run.datasetId}`}>
                <ArrowLeft /> Dataset
              </Link>
            </Button>
            {active && hasPermission(org.role, "evaluations:manage") && (
              <CancelRunButton ctx={{ orgId: org.id, slug: org.slug }} runId={run.id} />
            )}
          </>
        }
      />
      <PageBody>
        {run.error && (
          <Card className="border-destructive/50">
            <CardContent className="text-sm text-destructive">{run.error}</CardContent>
          </Card>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {tiles.map((t) => (
            <Card key={t.label} className="gap-2">
              <CardHeader>
                <CardDescription>{t.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">{t.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Answers</CardTitle>
            <CardDescription>
              Prompt {run.promptVersion ?? "—"} · {run.model ? `${run.provider}/${run.model}` : "no model used"} · graded by{" "}
              {run.judge === "heuristic" ? "word overlap (no model configured)" : (run.judge ?? "—")} ·{" "}
              {(run.inputTokens + run.outputTokens).toLocaleString()} tokens
            </CardDescription>
          </CardHeader>
          <CardContent>
            {run.results.length === 0 ? (
              <p className="text-sm text-muted-foreground">{active ? "Answering the first questions…" : "No results."}</p>
            ) : (
              <ul className="divide-y">
                {failedFirst.map((r) => (
                  <ResultRow key={r.id} result={r} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}

function ResultRow({ result: r }: { result: EvalResultView }) {
  const Icon = r.passed ? CheckCircle2 : XCircle;
  return (
    <li className="py-3 first:pt-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3">
          <Icon className={cn("mt-0.5 size-4 shrink-0", r.passed ? "text-emerald-600" : "text-destructive")} aria-label={r.passed ? "Passed" : "Failed"} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{r.question}</p>
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span>{STATUS_LABEL[r.answerStatus] ?? r.answerStatus}</span>
              {r.groundedness !== null && <span>grounded {pct(r.groundedness)}</span>}
              {r.relevance !== null && <span>relevant {pct(r.relevance)}</span>}
              {r.correctness !== null && <span>correct {pct(r.correctness)}</span>}
              {r.retrievalHit !== null && <span>{r.retrievalHit ? "right source found" : "expected source missed"}</span>}
              <span>{(r.latencyMs / 1000).toFixed(1)}s</span>
            </p>
          </div>
          {r.expectInsufficient && <Badge variant="outline">Should decline</Badge>}
        </summary>
        <div className="mt-3 space-y-3 pl-7 text-sm">
          {r.error ? (
            <p className="text-destructive">{r.error}</p>
          ) : (
            <div className="rounded-lg border bg-muted/30 p-3 whitespace-pre-wrap">{r.answer}</div>
          )}
          {r.expectedAnswer && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Expected:</span> {r.expectedAnswer}
            </p>
          )}
          {r.unsupportedClaims.length > 0 && (
            <div>
              <p className="font-medium">Not supported by the sources</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {r.unsupportedClaims.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {r.judgeNotes && <p className="text-xs text-muted-foreground">Reviewer: {r.judgeNotes}</p>}
        </div>
      </details>
    </li>
  );
}
