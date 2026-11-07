import { AlertTriangle, Info } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  formatPrice,
  hasPermission,
  isUnlimited,
  PLAN_LIMIT_KEYS,
  PLAN_LIMIT_LABELS,
  type BillingOverview,
  type PaymentRecord,
  type SubscriptionStatus,
} from "@groundline/shared";
import { PlanCard } from "@/components/plan-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { requireOrg } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "../_components/page-header";
import { CheckoutReturn, PlanAction, SubscriptionActions } from "./billing-client";

export const metadata: Metadata = { title: "Billing" };

const STATUS_LABEL: Record<SubscriptionStatus, { label: string; tone: "default" | "secondary" | "destructive" | "outline" }> = {
  ACTIVE: { label: "Active", tone: "default" },
  PAST_DUE: { label: "Past due", tone: "destructive" },
  ON_HOLD: { label: "On hold", tone: "destructive" },
  PENDING: { label: "Pending", tone: "secondary" },
  PAUSED: { label: "Paused", tone: "secondary" },
  CANCELLED: { label: "Cancelled", tone: "outline" },
  FAILED: { label: "Failed", tone: "destructive" },
  EXPIRED: { label: "Expired", tone: "outline" },
};

export default async function BillingPage({ params }: PageProps<"/o/[slug]/billing">) {
  const { slug } = await params;
  const { org } = await requireOrg(slug);
  if (!hasPermission(org.role, "billing:read")) notFound();

  const [billing, payments] = await Promise.all([
    api<BillingOverview>(`/orgs/${org.id}/billing`),
    api<PaymentRecord[]>(`/orgs/${org.id}/billing/payments`),
  ]);
  const canManage = hasPermission(org.role, "billing:manage");
  const ctx = { orgId: org.id, slug: org.slug };
  const sub = billing.subscription;
  const entitled = sub && (sub.status === "ACTIVE" || sub.status === "PAST_DUE");
  const periodEnd = sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : null;

  return (
    <>
      <Suspense>
        <CheckoutReturn ctx={ctx} />
      </Suspense>
      <PageHeader title="Billing" description="Your plan, usage and payment history." />
      <PageBody>
        {!billing.billingEnabled && (
          <Alert>
            <Info />
            <AlertTitle>Billing isn&apos;t connected in this environment</AlertTitle>
            <AlertDescription>
              Set the Dodo Payments keys in the API environment to enable checkout and plan changes.
            </AlertDescription>
          </Alert>
        )}
        {sub?.status === "PAST_DUE" && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Your last payment failed</AlertTitle>
            <AlertDescription>
              Update your payment method
              {sub.pastDueEndsAt ? ` before ${formatDate(sub.pastDueEndsAt)}` : " soon"} to keep your{" "}
              {billing.plan.name} features.
            </AlertDescription>
          </Alert>
        )}
        {sub?.status === "ON_HOLD" && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Your subscription is on hold</AlertTitle>
            <AlertDescription>
              A renewal payment failed, so the workspace is on the Free plan. Update your payment method to restore it.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardDescription>Current plan</CardDescription>
              <CardTitle className="flex items-center gap-3 text-2xl">
                {billing.plan.name}
                {sub && (
                  <Badge variant={STATUS_LABEL[sub.status].tone}>
                    {sub.cancelAtPeriodEnd && entitled ? "Cancels at period end" : STATUS_LABEL[sub.status].label}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {billing.plan.priceCents === 0
                  ? "You're on the Free plan. Upgrade for more teammates, knowledge sources and AI conversations."
                  : `${formatPrice(billing.plan.priceCents, billing.plan.currency)} per ${billing.plan.interval}. ` +
                    (sub?.status === "PAST_DUE"
                      ? "Payment is overdue."
                      : periodEnd
                      ? sub?.cancelAtPeriodEnd
                        ? `Access ends on ${periodEnd}.`
                        : `Renews on ${periodEnd}.`
                      : "")}
              </p>
              {canManage && sub?.status && sub.status !== "CANCELLED" && sub.status !== "EXPIRED" && sub.status !== "FAILED" && billing.billingEnabled && (
                <SubscriptionActions ctx={ctx} cancelScheduled={sub.cancelAtPeriodEnd} periodEnd={periodEnd} />
              )}
              {!canManage && (
                <p className="text-xs text-muted-foreground">Only workspace owners can change the plan.</p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Usage</CardTitle>
              <CardDescription>Against your plan&apos;s limits</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {PLAN_LIMIT_KEYS.map((key) => {
                const { used, limit } = billing.usage[key];
                const pct = isUnlimited(limit) || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span>{PLAN_LIMIT_LABELS[key]}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {used.toLocaleString()} / {isUnlimited(limit) ? "Unlimited" : limit.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full bg-foreground", pct >= 100 && "bg-destructive")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Plans</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {billing.plans.map((plan) => (
              <PlanCard
                key={plan.key}
                plan={plan}
                highlighted={plan.key === billing.plan.key}
                badge={plan.key === billing.plan.key ? "Current" : undefined}
                action={
                  <PlanAction
                    ctx={ctx}
                    plan={plan}
                    currentPlan={billing.plan}
                    hasSubscription={Boolean(entitled)}
                    cancelScheduled={Boolean(sub?.cancelAtPeriodEnd)}
                    canManage={canManage}
                    billingEnabled={billing.billingEnabled}
                  />
                }
              />
            ))}
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Payment history</CardTitle>
            <CardDescription>Charges for this workspace</CardDescription>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Invoice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatDate(p.createdAt)}</TableCell>
                      <TableCell className="text-muted-foreground">{describeCharge(p.chargeType)}</TableCell>
                      <TableCell className="tabular-nums">{formatPrice(p.amountCents, p.currency)}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === "succeeded" ? "secondary" : p.status === "failed" ? "destructive" : "outline"}>
                          {p.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {p.invoiceUrl ? (
                          <a href={p.invoiceUrl} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-4">
                            View
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}

function describeCharge(chargeType: string | null): string {
  switch (chargeType) {
    case "new":
      return "Subscription started";
    case "renewal":
      return "Renewal";
    case "plan_change":
      return "Plan change";
    default:
      return "Charge";
  }
}
