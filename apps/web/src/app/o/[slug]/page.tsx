import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission, type OrganizationOverview } from "@groundline/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { ActivityList } from "./_components/activity-list";
import { PageBody, PageHeader } from "./_components/page-header";
import { StatStrip } from "./_components/stat-strip";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ params }: PageProps<"/o/[slug]">) {
  const { slug } = await params;
  const { me, org } = await requireOrg(slug);
  const overview = await api<OrganizationOverview>(`/orgs/${org.id}/overview`);
  const base = `/o/${org.slug}`;
  const firstName = me.fullName?.split(" ")[0];

  const stats = [
    { label: "Team members", value: overview.members, hint: plural(overview.pendingInvitations, "pending invitation") },
    { label: "Knowledge sources", value: overview.knowledgeSources, hint: "Ready for the assistant" },
    { label: "Conversations", value: overview.conversations, hint: "Last 30 days" },
    { label: "Needs a human", value: overview.openTickets, hint: "Escalated conversations" },
  ];

  const steps = [
    { done: true, title: "Create your workspace", description: `${org.name} is ready.` },
    {
      done: overview.members > 1 || overview.pendingInvitations > 0,
      title: "Invite your team",
      description: "Add the people who will review conversations and handle tickets.",
      action: hasPermission(org.role, "members:manage") ? { label: "Invite teammates", href: `${base}/team` } : undefined,
    },
    {
      done: overview.knowledgeSources > 0,
      title: "Add your knowledge base",
      description: "Upload help-center articles, policies and product docs for the AI agent to learn from.",
      action: hasPermission(org.role, "knowledge:manage")
        ? { label: "Add knowledge", href: `${base}/knowledge` }
        : undefined,
    },
    {
      done: overview.conversations > 0,
      title: "Install the chat widget",
      description: "Embed the support assistant on your website with one script tag.",
      action: { label: "Get the snippet", href: `${base}/assistant` },
    },
  ];
  const completed = steps.filter((s) => s.done).length;

  return (
    <>
      <PageHeader
        title="Overview"
        description={firstName ? `Welcome back, ${firstName}. Here's how ${org.name} is doing.` : undefined}
      />
      <PageBody>
        <StatStrip stats={stats} />

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Get started</CardTitle>
              <CardDescription>
                {completed} of {steps.length} steps complete
              </CardDescription>
              <div
                role="progressbar"
                aria-label="Setup progress"
                aria-valuemin={0}
                aria-valuemax={steps.length}
                aria-valuenow={completed}
                className="mt-3 h-1 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full origin-left rounded-full bg-signal transition-transform duration-500 ease-out"
                  style={{ transform: `scaleX(${completed / steps.length})` }}
                />
              </div>
            </CardHeader>
            <CardContent>
              <ol className="space-y-5">
                {steps.map((step) => (
                  <li key={step.title} className="flex gap-3">
                    {step.done ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-signal" />
                    ) : (
                      <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground/50" />
                    )}
                    <div className="flex-1 space-y-1">
                      <p className={step.done ? "font-medium text-muted-foreground line-through" : "font-medium"}>
                        {step.title}
                      </p>
                      {!step.done && <p className="text-sm text-muted-foreground">{step.description}</p>}
                      {!step.done && step.action && (
                        <Button asChild size="sm" variant="outline" className="mt-2">
                          <Link href={step.action.href} className="group/step">
                            {step.action.label}
                            <ArrowRight className="transition-transform duration-200 ease-out group-hover/step:translate-x-0.5" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Changes made in this workspace</CardDescription>
            </CardHeader>
            <CardContent>
              {hasPermission(org.role, "audit:read") ? (
                <ActivityList items={overview.recentActivity} />
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Only owners and admins can see workspace activity.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
