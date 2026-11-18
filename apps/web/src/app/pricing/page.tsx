import { ChevronDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { PlanInfo } from "@groundline/shared";
import { PlanCard } from "@/components/plan-card";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

// Plans come from the API, which isn't available at build time; render on request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple monthly plans for Groundline. Start free and upgrade as your support volume grows.",
};

const faqs = [
  {
    q: "Can I change plans later?",
    a: "Yes. Upgrades take effect immediately and you pay the price difference. Moving to Free keeps your paid features until the end of the billing period.",
  },
  {
    q: "What counts as an AI conversation?",
    a: "A customer conversation in which the AI agent answers at least one question. Conversations handled only by your team don't count.",
  },
  {
    q: "How are payments processed?",
    a: "Payments are handled securely by Dodo Payments, our merchant of record, which also takes care of sales tax and invoices.",
  },
];

export default async function PricingPage() {
  const plans = await api<PlanInfo[]>("/plans", { auth: false });

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader current="pricing" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-16 pb-24 sm:pt-20">
        <div className="max-w-2xl animate-rise">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Pricing that grows with your support team
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            Start free. Upgrade when you need more teammates, knowledge or AI conversations.
          </p>
        </div>

        <div className="mt-16 grid items-stretch gap-6 md:grid-cols-3 md:gap-4 lg:gap-6">
          {plans.map((plan) => (
            <PlanCard
              key={plan.key}
              plan={plan}
              highlighted={plan.key === "starter"}
              className={plan.key === "starter" ? "md:-my-3 md:py-9" : undefined}
              badge={plan.key === "starter" ? "Most popular" : undefined}
              action={
                <Button
                  asChild
                  className="h-10 w-full"
                  variant={plan.key === "starter" ? "default" : "outline"}
                >
                  <Link href="/signup">{plan.priceCents === 0 ? "Start for free" : `Start with ${plan.name}`}</Link>
                </Button>
              }
            />
          ))}
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          Need more than Growth?{" "}
          <a
            href="mailto:sales@groundline.app"
            className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
          >
            Talk to us
          </a>{" "}
          about custom limits and SSO.
        </p>

        <section className="mt-28 grid gap-10 border-t pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-20">
          <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
          <div className="divide-y border-y">
            {faqs.map(({ q, a }, i) => (
              <details key={q} className="group" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-medium transition-colors hover:text-foreground/70 [&::-webkit-details-marker]:hidden">
                  <h3>{q}</h3>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-open:rotate-180" />
                </summary>
                <p className="max-w-xl pb-6 text-sm leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
