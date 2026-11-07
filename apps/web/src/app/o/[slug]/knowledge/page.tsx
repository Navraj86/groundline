import { AlertCircle, BookOpen, FileText, Globe, Loader2, Type } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasPermission, type KnowledgeSource, type KnowledgeSourceStatus } from "@groundline/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { formatRelative } from "@/lib/format";
import { PageBody, PageHeader } from "../_components/page-header";
import { AddSourceDialog } from "./add-source-dialog";
import { RefreshWhileProcessing, SourceActions } from "./source-actions";

export const metadata: Metadata = { title: "Knowledge base" };

const TYPE_ICON = { FILE: FileText, URL: Globe, TEXT: Type } as const;

const STATUS: Record<KnowledgeSourceStatus, { label: string; variant: "secondary" | "outline" | "destructive" | "default" }> = {
  PENDING: { label: "Queued", variant: "outline" },
  PROCESSING: { label: "Processing", variant: "outline" },
  READY: { label: "Ready", variant: "secondary" },
  FAILED: { label: "Failed", variant: "destructive" },
};

export default async function KnowledgePage({ params }: PageProps<"/o/[slug]/knowledge">) {
  const { slug } = await params;
  const { org } = await requireOrg(slug);
  if (!hasPermission(org.role, "knowledge:read")) notFound();

  const sources = await api<KnowledgeSource[]>(`/orgs/${org.id}/knowledge`);
  const canManage = hasPermission(org.role, "knowledge:manage");
  const processing = sources.some((s) => s.status === "PENDING" || s.status === "PROCESSING");
  const ready = sources.filter((s) => s.status === "READY");
  const chunks = ready.reduce((sum, s) => sum + s.chunkCount, 0);

  return (
    <>
      <RefreshWhileProcessing active={processing} />
      <PageHeader
        title="Knowledge base"
        description="Documents and pages your assistant answers from. It won't answer beyond them."
        actions={canManage ? <AddSourceDialog orgId={org.id} slug={org.slug} /> : undefined}
      />
      <PageBody>
        {sources.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-3">
              <BookOpen className="size-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">Add your first source</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Upload help-center articles, policies or product docs, add pages from your website, or paste an FAQ.
            </p>
            {canManage && (
              <div className="mt-6">
                <AddSourceDialog orgId={org.id} slug={org.slug} />
              </div>
            )}
          </div>
        ) : (
          <Card>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                {ready.length} of {sources.length} sources ready · {chunks.toLocaleString()} indexed passages
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Passages</TableHead>
                    <TableHead className="hidden lg:table-cell">Added</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((source) => {
                    const Icon = TYPE_ICON[source.type];
                    const status = STATUS[source.status];
                    const busy = source.status === "PENDING" || source.status === "PROCESSING";
                    return (
                      <TableRow key={source.id}>
                        <TableCell className="max-w-0 w-full">
                          <div className="flex items-center gap-3">
                            <Icon className="size-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{source.title}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {source.type === "TEXT" ? "Pasted text" : (source.url ?? source.fileName)}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {source.status === "FAILED" && source.error ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="destructive" className="cursor-help">
                                  <AlertCircle /> {status.label}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">{source.error}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Badge variant={status.variant}>
                              {busy && <Loader2 className="animate-spin" />} {status.label}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden tabular-nums text-muted-foreground md:table-cell">
                          {source.status === "READY" ? source.chunkCount : "—"}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          {formatRelative(source.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          {canManage && (
                            <SourceActions
                              orgId={org.id}
                              slug={org.slug}
                              sourceId={source.id}
                              title={source.title}
                              busy={busy}
                              isUrl={source.type === "URL"}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </PageBody>
    </>
  );
}
