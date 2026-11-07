"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { formatPrice, type PlanInfo } from "@groundline/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  changePlan,
  openPortal,
  setCancellation,
  startCheckout,
  syncBilling,
  type BillingActionState,
} from "./actions";

type Ctx = { orgId: string; slug: string };

function useBillingAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<BillingActionState>) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else if (res.redirectUrl) window.location.assign(res.redirectUrl);
      else if (res.message) toast.success(res.message);
    });
  return { pending, run };
}

/** The button under a plan card on the billing page. */
export function PlanAction({
  ctx,
  plan,
  currentPlan,
  hasSubscription,
  cancelScheduled,
  canManage,
  billingEnabled,
}: {
  ctx: Ctx;
  plan: PlanInfo;
  currentPlan: PlanInfo;
  hasSubscription: boolean;
  cancelScheduled: boolean;
  canManage: boolean;
  billingEnabled: boolean;
}) {
  const { pending, run } = useBillingAction();
  const [confirming, setConfirming] = useState(false);

  if (plan.key === currentPlan.key) {
    return (
      <Button variant="outline" className="w-full" disabled>
        Current plan
      </Button>
    );
  }

  const isUpgrade = plan.priceCents > currentPlan.priceCents;
  const label = plan.priceCents === 0 ? "Switch to Free" : isUpgrade ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`;
  const disabled =
    !canManage || !billingEnabled || pending || !plan.purchasable || (plan.priceCents === 0 && cancelScheduled);

  const act = () => {
    if (!hasSubscription) {
      run(() => startCheckout(ctx.orgId, plan.key));
    } else {
      run(() => changePlan(ctx.orgId, ctx.slug, plan.key));
    }
  };

  // Changing an existing subscription charges or credits immediately: confirm first.
  const needsConfirm = hasSubscription;

  return (
    <>
      <Button
        className="w-full"
        variant={isUpgrade ? "default" : "outline"}
        disabled={disabled}
        onClick={() => (needsConfirm ? setConfirming(true) : act())}
      >
        {pending && <Loader2 className="animate-spin" />}
        {plan.priceCents === 0 && cancelScheduled ? "Switching at period end" : label}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {plan.priceCents === 0
                ? "Your subscription will end at the close of the current billing period. You keep your paid features until then."
                : isUpgrade
                  ? `You'll be charged the difference between ${formatPrice(currentPlan.priceCents)} and ${formatPrice(plan.priceCents)} now, and ${formatPrice(plan.priceCents)} per ${plan.interval} after that.`
                  : `The price difference is credited toward your future renewals. You'll pay ${formatPrice(plan.priceCents)} per ${plan.interval}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                act();
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function SubscriptionActions({
  ctx,
  cancelScheduled,
  periodEnd,
}: {
  ctx: Ctx;
  cancelScheduled: boolean;
  periodEnd: string | null;
}) {
  const portal = useBillingAction();
  const cancellation = useBillingAction();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={portal.pending} onClick={() => portal.run(() => openPortal(ctx.orgId))}>
        {portal.pending ? <Loader2 className="animate-spin" /> : <ExternalLink />}
        Payment methods & invoices
      </Button>
      {cancelScheduled ? (
        <Button
          disabled={cancellation.pending}
          onClick={() => cancellation.run(() => setCancellation(ctx.orgId, ctx.slug, false))}
        >
          {cancellation.pending && <Loader2 className="animate-spin" />}
          Keep my subscription
        </Button>
      ) : (
        <Button variant="ghost" disabled={cancellation.pending} onClick={() => setConfirming(true)}>
          Cancel subscription
        </Button>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              You keep your current plan{periodEnd ? ` until ${periodEnd}` : " until the end of the billing period"}.
              After that the workspace moves to the Free plan. You can resume any time before then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                cancellation.run(() => setCancellation(ctx.orgId, ctx.slug, true));
              }}
            >
              Cancel at period end
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * After returning from checkout, ask the API to reconcile with the provider so the new
 * plan shows up even if the webhook hasn't arrived yet.
 */
export function CheckoutReturn({ ctx }: { ctx: Ctx }) {
  const params = useSearchParams();
  const router = useRouter();
  const handled = useRef(false);
  const status = params.get("checkout");

  useEffect(() => {
    if (!status || handled.current) return;
    handled.current = true;
    router.replace(`/o/${ctx.slug}/billing`, { scroll: false });

    if (status === "cancelled") {
      toast.info("Checkout cancelled. You haven't been charged.");
      return;
    }
    const id = toast.loading("Confirming your payment…");
    syncBilling(ctx.orgId, ctx.slug).then((res) => {
      if (res.error) toast.error(res.error, { id });
      else toast.success(`You're on the ${res.planName} plan.`, { id });
      router.refresh();
    });
  }, [status, ctx, router]);

  return null;
}
