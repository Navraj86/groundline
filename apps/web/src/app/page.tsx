import { ArrowRight, BarChart3, BookOpenCheck, Bot, ShieldCheck, Ticket, Users } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: BookOpenCheck,
    title: "Grounded in your docs",
    body: "Upload help articles, policies and product docs. Every answer is retrieved from your own knowledge and cites its sources.",
  },
  {
    icon: Bot,
    title: "An agent that can act",
    body: "Look up customers and subscriptions or open tickets through tools you register, each with its own permissions.",
  },
  {
    icon: ShieldCheck,
    title: "People stay in control",
    body: "Sensitive actions pause for approval from your team, and every action the agent takes is logged.",
  },
  {
    icon: Ticket,
    title: "Smooth hand-offs",
    body: "When the AI isn't sure, it says so and escalates to a human with the full conversation attached.",
  },
  {
    icon: BarChart3,
    title: "Know what's working",
    body: "Track resolution rates, response times, escalations, token usage and cost from one dashboard.",
  },
  {
    icon: Users,
    title: "Built for teams",
    body: "Separate workspaces per company, with owner, admin, support agent and viewer roles.",
  },
];

const steps = [
  { title: "Connect your knowledge", body: "Upload PDFs or point Groundline at your documentation site." },
  { title: "Embed the widget", body: "Add one script tag to your site or app." },
  { title: "Review and improve", body: "Watch conversations, handle escalations and tune the agent." },
];

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
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

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] opacity-60 [background:radial-gradient(50%_60%_at_50%_0%,var(--color-muted)_0%,transparent_100%)]"
          />
          <div className="relative mx-auto max-w-3xl px-6 pt-24 pb-20 text-center">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500" /> AI customer support for growing teams
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              Support answers your customers can trust.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-pretty text-muted-foreground">
              Groundline gives your company an AI support agent that answers from your own documentation, takes
              approved actions, and hands off to your team when it should.
            </p>
            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/signup">
                  Create your workspace <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
              Everything between a question and a resolution
            </h2>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-xl border bg-background p-6">
                  <Icon className="size-5 text-muted-foreground" />
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Live in an afternoon</h2>
          <ol className="mt-12 grid gap-8 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="space-y-2">
                <span className="flex size-8 items-center justify-center rounded-full border text-sm font-medium">
                  {i + 1}
                </span>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Groundline</span>
          <span>AI support, grounded in your knowledge.</span>
        </div>
      </footer>
    </div>
  );
}
