import type { Metadata } from "next";
import Link from "next/link";
import type { PlanInfo } from "@groundline/shared";
import { Logo } from "@/components/logo";
import { PlanCard } from "@/components/plan-card";
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
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo />
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight">Pricing that grows with your support team</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Start free. Upgrade when you need more teammates, knowledge or AI conversations.
          </p>
        </div>
        <div className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.key}
              plan={plan}
              highlighted={plan.key === "starter"}
              badge={plan.key === "starter" ? "Most popular" : undefined}
              action={
                <Button asChild className="w-full" variant={plan.key === "starter" ? "default" : "outline"}>
                  <Link href="/signup">{plan.priceCents === 0 ? "Start for free" : `Start with ${plan.name}`}</Link>
                </Button>
              }
            />
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Need more than Growth? <a href="mailto:sales@groundline.app" className="underline underline-offset-4">Talk to us</a>{" "}
          about custom limits and SSO.
        </p>
        <section className="mx-auto mt-20 max-w-2xl space-y-6">
          <h2 className="text-xl font-semibold">Questions</h2>
          {faqs.map(({ q, a }) => (
            <div key={q} className="space-y-1">
              <h3 className="font-medium">{q}</h3>
              <p className="text-sm text-muted-foreground">{a}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
