import { ArrowRight, BarChart3, BookOpenCheck, Bot, ShieldCheck, Ticket, Users } from "lucide-react";
import Link from "next/link";
import { AnswerDemo } from "@/components/landing/answer-demo";
import { SiteHeader } from "@/components/site-header";
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
      <SiteHeader />

      <main className="flex-1">
        <section className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] bg-size-[48px_48px] opacity-40 mask-[radial-gradient(70%_60%_at_70%_40%,black,transparent)]"
          />
          <div className="mx-auto grid max-w-6xl items-center gap-16 px-6 pt-16 pb-24 sm:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pt-24 lg:pb-32">
            <div className="animate-rise">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl lg:leading-[1.05]">
                Support answers your customers can trust.
              </h1>
              <p className="mt-6 max-w-lg text-lg text-muted-foreground">
                Groundline gives your company an AI support agent that answers from your own documentation, takes
                approved actions, and hands off to your team when it should.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-11 px-5 text-[0.95rem]">
                  <Link href="/signup" className="group/cta">
                    Create your workspace
                    <ArrowRight className="transition-transform duration-200 ease-out group-hover/cta:translate-x-0.5" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-11 px-5 text-[0.95rem]">
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
            </div>

            <AnswerDemo />
          </div>
          <GroundLine />
        </section>

        <section className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-20 lg:py-32">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <h2 className="max-w-sm text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything between a question and a resolution
            </h2>
          </div>
          <dl className="grid gap-x-10 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="group/feature border-t py-8">
                <dt className="flex items-center gap-3 font-semibold">
                  <span className="flex size-9 items-center justify-center rounded-lg border bg-background transition-colors duration-200 group-hover/feature:border-foreground/30">
                    <Icon className="size-4 text-muted-foreground transition-colors duration-200 group-hover/feature:text-foreground" />
                  </span>
                  {title}
                </dt>
                <dd className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border-y bg-muted/40">
          <div className="mx-auto max-w-6xl px-6 py-24 lg:py-28">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Live in an afternoon</h2>
            <ol className="relative mt-14 grid gap-12 md:grid-cols-3 md:gap-8">
              <span aria-hidden className="absolute top-4 right-0 left-0 hidden h-px bg-border md:block" />
              {steps.map((step, i) => (
                <li key={step.title} className="relative">
                  <span className="relative flex size-8 items-center justify-center rounded-full border bg-background text-sm font-medium tabular-nums">
                    {i + 1}
                  </span>
                  <h3 className="mt-6 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                  {i === 1 && (
                    <pre className="mt-4 overflow-x-auto rounded-lg border bg-background px-3 py-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                      <code>
                        <span className="text-foreground">&lt;script</span> src=&quot;…/widget.js&quot;{"\n"}
                        {"  "}data-groundline-key=&quot;…&quot; async<span className="text-foreground">&gt;&lt;/script&gt;</span>
                      </code>
                    </pre>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-6 py-24 md:flex-row md:items-end">
          <h2 className="max-w-lg text-3xl font-semibold tracking-tight sm:text-4xl">
            AI support, grounded in your knowledge.
          </h2>
          <div className="flex gap-3">
            <Button asChild size="lg" className="h-11 px-5 text-[0.95rem]">
              <Link href="/signup" className="group/cta">
                Get started
                <ArrowRight className="transition-transform duration-200 ease-out group-hover/cta:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="h-11 px-5 text-[0.95rem]">
              <Link href="/pricing">Pricing</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} Groundline</span>
          <nav className="flex gap-6">
            <Link href="/pricing" className="transition-colors hover:text-foreground">
              Pricing
            </Link>
            <Link href="/login" className="transition-colors hover:text-foreground">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** The logo's idea at page scale: a signal settling onto a flat line. */
function GroundLine() {
  return (
    <svg aria-hidden viewBox="0 0 1200 40" preserveAspectRatio="none" className="block h-10 w-full text-border">
      <path
        d="M0 30 H420 c40 0 50 -22 80 -22 s40 22 80 22 s30 -14 50 -14 s30 14 50 14 H1200"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
