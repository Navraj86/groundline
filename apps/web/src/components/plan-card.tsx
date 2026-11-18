import { Check } from "lucide-react";
import { formatPrice, type PlanInfo } from "@groundline/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Presentational plan card shared by the pricing page and the billing page. */
export function PlanCard({
  plan,
  highlighted,
  badge,
  action,
  className,
}: {
  plan: PlanInfo;
  highlighted?: boolean;
  badge?: string;
  action: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border bg-card p-6 transition-[border-color,box-shadow] duration-200 ease-out hover:border-foreground/25",
        highlighted &&
          "border-foreground/50 shadow-[0_24px_48px_-28px_oklch(0_0_0/0.35)] hover:border-foreground/60",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{plan.name}</h3>
        {badge && <Badge variant={highlighted ? "default" : "secondary"}>{badge}</Badge>}
      </div>
      <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.description}</p>
      <p className="mt-6 flex items-baseline gap-1 border-b pb-6">
        <span className="text-4xl font-semibold tracking-tight tabular-nums">
          {formatPrice(plan.priceCents, plan.currency)}
        </span>
        <span className="text-sm text-muted-foreground">/ {plan.interval}</span>
      </p>
      <ul className="mt-6 flex-1 space-y-2.5 text-sm">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-signal" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8">{action}</div>
    </div>
  );
}
