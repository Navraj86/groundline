import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "../_components/coming-soon";

export const metadata: Metadata = { title: "Conversations" };

export default function ConversationsPage() {
  return (
    <ComingSoon
      title="Conversations"
      icon={MessagesSquare}
      description="Review every chat between your customers and the AI agent, with the sources behind each answer."
      features={["Full conversation history", "Source references per answer", "Escalation to a human", "Embeddable chat widget"]}
    />
  );
}
