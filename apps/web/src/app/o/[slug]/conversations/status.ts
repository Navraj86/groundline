import type { ConversationStatus } from "@groundline/shared";

export const STATUS_BADGE: Record<ConversationStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  OPEN: { label: "AI handling", variant: "secondary" },
  ESCALATED: { label: "Needs a human", variant: "destructive" },
  RESOLVED: { label: "Resolved", variant: "outline" },
};
