import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "../_components/coming-soon";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <ComingSoon
      title="Analytics"
      icon={BarChart3}
      description="Track how much support the AI handles, how fast customers get answers, and what it costs."
      features={["AI-resolved vs. escalated", "Response and resolution times", "Token usage and cost", "Custom date ranges"]}
    />
  );
}
