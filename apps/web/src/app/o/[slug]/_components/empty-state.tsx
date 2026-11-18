import type { LucideIcon } from "lucide-react";

/** What belongs in an empty region, and the one action that fills it. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative isolate flex flex-col items-center overflow-hidden rounded-xl border border-dashed px-6 py-16 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] bg-size-[14px_14px] mask-[radial-gradient(45%_55%_at_50%_35%,black,transparent)]"
      />
      <div className="mb-5 flex size-12 items-center justify-center rounded-xl border bg-background shadow-sm">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {children}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
