import { Ticket } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "../_components/coming-soon";

export const metadata: Metadata = { title: "Tickets" };

export default function TicketsPage() {
  return (
    <ComingSoon
      title="Tickets"
      icon={Ticket}
      description="Questions the AI can't resolve become tickets for your team, with the conversation attached."
      features={["Priorities and statuses", "Assignment to agents", "Internal notes", "Activity history"]}
    />
  );
}
