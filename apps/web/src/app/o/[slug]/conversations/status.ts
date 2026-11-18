import type { ConversationStatus } from "@groundline/shared";

export const STATUS_BADGE: Record<
  ConversationStatus,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive"; className?: string }
> = {
  OPEN: { label: "AI handling", variant: "outline", className: "border-transparent bg-foreground/6" },
  ESCALATED: { label: "Needs a human", variant: "destructive" },
  RESOLVED: { label: "Resolved", variant: "outline", className: "border-transparent bg-signal/12 text-signal-ink" },
};
