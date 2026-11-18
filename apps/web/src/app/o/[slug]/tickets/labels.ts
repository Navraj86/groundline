import type { TicketPriority, TicketStatus } from "@groundline/shared";

/** Badge tones by status: open asks for attention, resolved is the one green state, closed recedes. */
export const STATUS_CLASS: Record<TicketStatus, string> = {
  OPEN: "border-foreground/25 text-foreground",
  IN_PROGRESS: "border-transparent bg-foreground/6 text-foreground",
  RESOLVED: "border-transparent bg-signal/12 text-signal-ink",
  CLOSED: "border-border text-muted-foreground",
};

/** How many of the three priority bars are lit. */
export const PRIORITY_LEVEL: Record<TicketPriority, number> = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  URGENT: 3,
};
