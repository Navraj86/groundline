import Link from "next/link";
import { cn } from "@/lib/utils";

export type FilterTab = { label: string; href: string; active: boolean };

/**
 * A segmented row of links for filters that live in the URL. The active one is
 * raised out of the track, so the current view reads at a glance.
 */
export function FilterTabs({ label, tabs, className }: { label: string; tabs: FilterTab[]; className?: string }) {
  return (
    <nav aria-label={label} className={cn("inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-1", className)}>
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1 text-sm whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] duration-150 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
            tab.active && "bg-background font-medium text-foreground shadow-sm ring-1 ring-foreground/5",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
