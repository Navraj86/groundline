import { FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EVAL_TEMPLATES, hasPermission, type EvalDatasetSummary, type EvalRunSummary, type Paginated } from "@groundline/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { PageBody, PageHeader } from "../_components/page-header";
import { NewDatasetDialog, TemplateButton } from "./evaluations-client";
import { passRate, RunsTable, RunStatusBadge } from "./shared";

export const metadata: Metadata = { title: "Evaluations" };

export default async function EvaluationsPage({ params }: PageProps<"/o/[slug]/evaluations">) {
  const { slug } = await params;
  const { org } = await requireOrg(slug);
  if (!hasPermission(org.role, "evaluations:read")) notFound();
  const canManage = hasPermission(org.role, "evaluations:manage");
  const ctx = { orgId: org.id, slug: org.slug };

  const [datasets, runs] = await Promise.all([
    api<EvalDatasetSummary[]>(`/orgs/${org.id}/evaluations/datasets`),
    api<Paginated<EvalRunSummary>>(`/orgs/${org.id}/evaluations/runs?limit=15`),
  ]);
  const hasGuardrails = datasets.some((d) => d.name === EVAL_TEMPLATES.guardrails.name);

  return (
    <>
      <PageHeader
        title="Evaluations"
        description="Test the assistant on questions you know the answers to, and track quality as your knowledge base and prompts change."
        actions={
          canManage && (
            <>
              {!hasGuardrails && <TemplateButton ctx={ctx} template="guardrails" label="Add guardrail tests" />}
              <NewDatasetDialog ctx={ctx} />
            </>
          )
        }
      />
      <PageBody>
        {datasets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <FlaskConical className="size-8 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">No evaluation datasets yet</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Start with the built-in guardrail tests, or create a dataset of the questions your customers ask most.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {datasets.map((d) => (
              <Link key={d.id} href={`/o/${org.slug}/evaluations/${d.id}`} className="group">
                <Card className="h-full transition group-hover:border-foreground/20">
                  <CardHeader>
                    <CardTitle className="group-hover:underline">{d.name}</CardTitle>
                    {d.description && <CardDescription className="line-clamp-2">{d.description}</CardDescription>}
                  </CardHeader>
                  <CardContent className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {d.caseCount} question{d.caseCount === 1 ? "" : "s"}
                    </span>
                    {d.lastRun ? (
                      <span className="flex items-center gap-2">
                        <span className="font-medium tabular-nums">{passRate(d.lastRun)}</span>
                        <RunStatusBadge run={d.lastRun} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not run yet</span>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {runs.items.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent runs</CardTitle>
              <CardDescription>Every run is kept, so you can compare prompt versions and models over time.</CardDescription>
            </CardHeader>
            <CardContent>
              <RunsTable runs={runs.items} slug={org.slug} showDataset />
            </CardContent>
          </Card>
        )}
      </PageBody>
    </>
  );
}
