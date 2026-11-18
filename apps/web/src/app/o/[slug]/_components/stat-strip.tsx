import { cn } from "@/lib/utils";

export type Stat = { label: string; value: React.ReactNode; hint?: React.ReactNode };

/** Headline figures in one ruled strip: label, the number, and what it counts. */
export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-xl border bg-card",
        stats.length === 5 ? "lg:grid-cols-3 xl:grid-cols-5" : "xl:grid-cols-4",
        className,
      )}
    >
      {stats.map(({ label, value, hint }) => (
        <div key={label} className="-mb-px -ml-px border-b border-l p-5 transition-colors duration-200 hover:bg-muted/40">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</dd>
          {hint && <dd className="mt-1 text-xs text-muted-foreground">{hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
