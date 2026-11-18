import { TICKET_PRIORITY_LABELS, type TicketPriority } from "@groundline/shared";
import { cn } from "@/lib/utils";
import { PRIORITY_LEVEL } from "./labels";

/** Priority as a small signal meter beside its label; urgent turns the bars red. */
export function PriorityMark({ priority, className }: { priority: TicketPriority; className?: string }) {
  const level = PRIORITY_LEVEL[priority];
  const urgent = priority === "URGENT";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs",
        urgent ? "font-medium text-destructive" : priority === "LOW" ? "text-muted-foreground" : "text-foreground",
        className,
      )}
    >
      <span aria-hidden className="flex h-3 items-end gap-0.5">
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className={cn(
              "w-[3px] rounded-[1px]",
              bar === 1 ? "h-1" : bar === 2 ? "h-2" : "h-3",
              bar <= level ? (urgent ? "bg-destructive" : "bg-foreground/70") : "bg-foreground/15",
            )}
          />
        ))}
      </span>
      {TICKET_PRIORITY_LABELS[priority]}
    </span>
  );
}
