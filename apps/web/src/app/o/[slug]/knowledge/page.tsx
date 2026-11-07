import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "../_components/coming-soon";

export const metadata: Metadata = { title: "Knowledge base" };

export default function KnowledgePage() {
  return (
    <ComingSoon
      title="Knowledge base"
      icon={BookOpen}
      description="Upload the documents your AI agent should learn from. Groundline extracts, chunks and indexes them for semantic search."
      features={["PDF and text uploads", "Documentation website URLs", "Processing status and retries", "Per-source updates and deletion"]}
    />
  );
}
