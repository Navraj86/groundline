import type { EvalRunStatus, EvalRunSummary } from "@groundline/shared";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelative } from "@/lib/format";

export const RUN_STATUS: Record<EvalRunStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  QUEUED: { label: "Queued", variant: "outline" },
  RUNNING: { label: "Running", variant: "default" },
  COMPLETED: { label: "Completed", variant: "secondary" },
  FAILED: { label: "Failed", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);

export function RunStatusBadge({ run }: { run: Pick<EvalRunSummary, "status" | "completedCases" | "totalCases"> }) {
  const s = RUN_STATUS[run.status];
  return (
    <Badge variant={s.variant}>
      {s.label}
      {run.status === "RUNNING" && ` ${run.completedCases}/${run.totalCases}`}
    </Badge>
  );
}

/** Pass rate of a finished run, or progress while it runs. */
export function passRate(run: EvalRunSummary): string {
  if (run.status === "COMPLETED") return pct(run.metrics?.passRate);
  return run.completedCases ? `${run.passedCases}/${run.completedCases} so far` : "—";
}

export function RunsTable({ runs, slug, showDataset }: { runs: EvalRunSummary[]; slug: string; showDataset?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showDataset && <TableHead>Dataset</TableHead>}
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Passed</TableHead>
          <TableHead className="text-right">Grounded</TableHead>
          <TableHead className="text-right">Retrieval</TableHead>
          <TableHead>Prompt · model</TableHead>
          <TableHead>Started</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((r) => (
          <TableRow key={r.id}>
            {showDataset && (
              <TableCell>
                <Link href={`/o/${slug}/evaluations/runs/${r.id}`} className="font-medium hover:underline">
                  {r.datasetName}
                </Link>
              </TableCell>
            )}
            <TableCell>
              <Link href={`/o/${slug}/evaluations/runs/${r.id}`}>
                <RunStatusBadge run={r} />
              </Link>
            </TableCell>
            <TableCell className="text-right tabular-nums">{passRate(r)}</TableCell>
            <TableCell className="text-right tabular-nums">{pct(r.metrics?.avgGroundedness)}</TableCell>
            <TableCell className="text-right tabular-nums">{pct(r.metrics?.retrievalHitRate)}</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {r.promptVersion ?? "—"}
              {r.model && ` · ${r.model}`}
            </TableCell>
            <TableCell className="text-muted-foreground">{formatRelative(r.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
