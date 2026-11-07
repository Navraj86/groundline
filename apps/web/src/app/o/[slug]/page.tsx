import { BookOpen, CheckCircle2, Circle, MailPlus, MessagesSquare, Ticket, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission, type OrganizationOverview } from "@groundline/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { ActivityList } from "./_components/activity-list";
import { PageBody, PageHeader } from "./_components/page-header";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ params }: PageProps<"/o/[slug]">) {
  const { slug } = await params;
  const { me, org } = await requireOrg(slug);
  const overview = await api<OrganizationOverview>(`/orgs/${org.id}/overview`);
  const base = `/o/${org.slug}`;
  const firstName = me.fullName?.split(" ")[0];

  const stats = [
    { label: "Team members", value: overview.members, icon: Users, hint: `${overview.pendingInvitations} pending invitations` },
    { label: "Knowledge sources", value: overview.knowledgeSources, icon: BookOpen, hint: "Documents and URLs" },
    { label: "Conversations", value: overview.conversations, icon: MessagesSquare, hint: "Last 30 days" },
    { label: "Open tickets", value: overview.openTickets, icon: Ticket, hint: "Escalated to your team" },
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
    },
    {
      done: overview.conversations > 0,
      title: "Install the chat widget",
      description: "Embed the support assistant on your website with one script tag.",
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, hint }) => (
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

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Get started</CardTitle>
              <CardDescription>
                {completed} of {steps.length} steps complete
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-5">
                {steps.map((step) => (
                  <li key={step.title} className="flex gap-3">
                    {step.done ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
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
                          <Link href={step.action.href}>
                            <MailPlus /> {step.action.label}
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
