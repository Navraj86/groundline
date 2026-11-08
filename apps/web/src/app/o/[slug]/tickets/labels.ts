import type { TicketPriority, TicketStatus } from "@groundline/shared";

type Variant = "default" | "secondary" | "outline" | "destructive";

export const STATUS_VARIANT: Record<TicketStatus, Variant> = {
  OPEN: "default",
  IN_PROGRESS: "secondary",
  RESOLVED: "outline",
  CLOSED: "outline",
};

export const PRIORITY_CLASS: Record<TicketPriority, string> = {
  LOW: "text-muted-foreground",
  NORMAL: "text-foreground",
  HIGH: "text-amber-600",
  URGENT: "text-destructive font-semibold",
};
