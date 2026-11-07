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
}: {
  plan: PlanInfo;
  highlighted?: boolean;
  badge?: string;
  action: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-card p-6",
        highlighted && "border-foreground/40 shadow-sm ring-1 ring-foreground/10",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{plan.name}</h3>
        {badge && <Badge variant={highlighted ? "default" : "secondary"}>{badge}</Badge>}
      </div>
      <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.description}</p>
      <p className="mt-4">
        <span className="text-3xl font-semibold tabular-nums">{formatPrice(plan.priceCents, plan.currency)}</span>
        <span className="text-sm text-muted-foreground"> / {plan.interval}</span>
      </p>
      <ul className="mt-6 flex-1 space-y-2 text-sm">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">{action}</div>
    </div>
  );
}
