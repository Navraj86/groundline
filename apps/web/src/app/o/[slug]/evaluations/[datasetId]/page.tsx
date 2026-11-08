import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  EVAL_MAX_CASES,
  hasPermission,
  type EvalDatasetDetail,
  type EvalRunSummary,
  type KnowledgeSource,
  type Paginated,
} from "@groundline/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { PageBody, PageHeader } from "../../_components/page-header";
import { AddCaseForm, DeleteCaseButton, DeleteDatasetButton, RunButton } from "../evaluations-client";
import { RunsTable } from "../shared";

export const metadata: Metadata = { title: "Evaluation dataset" };

export default async function DatasetPage({ params }: PageProps<"/o/[slug]/evaluations/[datasetId]">) {
  const { slug, datasetId } = await params;
  const { org } = await requireOrg(slug);
  if (!hasPermission(org.role, "evaluations:read")) notFound();
  const canManage = hasPermission(org.role, "evaluations:manage");
  const ctx = { orgId: org.id, slug: org.slug };

  let dataset: EvalDatasetDetail;
  try {
    dataset = await api<EvalDatasetDetail>(`/orgs/${org.id}/evaluations/datasets/${datasetId}`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  const [runs, sources] = await Promise.all([
    api<Paginated<EvalRunSummary>>(`/orgs/${org.id}/evaluations/runs?datasetId=${dataset.id}&limit=20`),
    canManage && hasPermission(org.role, "knowledge:read")
      ? api<KnowledgeSource[]>(`/orgs/${org.id}/knowledge`)
      : Promise.resolve([] as KnowledgeSource[]),
  ]);
  const running = runs.items.some((r) => r.status === "QUEUED" || r.status === "RUNNING");

  return (
    <>
      <PageHeader
        title={dataset.name}
        description={dataset.description ?? undefined}
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link href={`/o/${org.slug}/evaluations`}>
                <ArrowLeft /> All datasets
              </Link>
            </Button>
            {canManage && (
              <>
                <DeleteDatasetButton ctx={ctx} datasetId={dataset.id} name={dataset.name} />
                <RunButton ctx={ctx} datasetId={dataset.id} disabled={dataset.caseCount === 0 || running} />
              </>
            )}
          </>
        }
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Questions</CardTitle>
              <CardDescription>
                {dataset.caseCount} of {EVAL_MAX_CASES}. Each run asks all of them, the way a customer would.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dataset.cases.length === 0 ? (
                <p className="text-sm text-muted-foreground">No questions yet.</p>
              ) : (
                <ol className="divide-y">
                  {dataset.cases.map((c, i) => (
                    <li key={c.id} className="flex gap-3 py-3 first:pt-0">
                      <span className="w-6 shrink-0 text-sm text-muted-foreground tabular-nums">{i + 1}.</span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-medium">{c.question}</p>
                        {c.expectInsufficient ? (
                          <Badge variant="outline">Should decline</Badge>
                        ) : (
                          <>
                            {c.expectedAnswer && <p className="text-sm text-muted-foreground">Expected: {c.expectedAnswer}</p>}
                            {c.expectedSources.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Sources: {c.expectedSources.map((s) => s.title).join(", ")}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                      {canManage && <DeleteCaseButton ctx={ctx} datasetId={dataset.id} caseId={c.id} />}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {canManage && dataset.caseCount < EVAL_MAX_CASES && (
            <Card className="h-fit lg:col-span-2">
              <CardHeader>
                <CardTitle>Add a question</CardTitle>
                <CardDescription>Use real questions from your customers, in their words.</CardDescription>
              </CardHeader>
              <CardContent>
                <AddCaseForm
                  ctx={ctx}
                  datasetId={dataset.id}
                  sources={sources.filter((s) => s.status === "READY").map((s) => ({ id: s.id, title: s.title }))}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Run history</CardTitle>
            <CardDescription>
              {runs.items.length ? "Compare runs as you change the knowledge base, instructions or model." : "This dataset hasn't been run yet."}
            </CardDescription>
          </CardHeader>
          {runs.items.length > 0 && (
            <CardContent>
              <RunsTable runs={runs.items} slug={org.slug} />
            </CardContent>
          )}
        </Card>
      </PageBody>
    </>
  );
}
