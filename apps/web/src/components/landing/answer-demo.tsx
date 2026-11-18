import { ArrowUp, FileText, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A still of the chat widget doing its one job: answering from a source it can point to,
 * and stopping for a person when the request needs one. The answer is quoted from the
 * pricing page's own FAQ, so nothing here is invented.
 */
export function AnswerDemo({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-auto w-full max-w-md lg:mx-0 lg:ml-auto", className)}>
      <SourceSheet className="absolute -bottom-20 -left-28 z-10 hidden w-64 xl:block" />

      <div className="relative overflow-hidden rounded-2xl border bg-background shadow-[0_1px_0_0_var(--color-border),0_24px_48px_-24px_oklch(0_0_0/0.25)]">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <div className="flex size-8 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
            G
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold">Groundline Support</p>
            <p className="truncate text-xs text-muted-foreground">Answers from our help resources</p>
          </div>
        </div>

        <div className="space-y-4 px-4 py-5 text-sm">
          <Step delay={200} align="end">
            <p className="rounded-2xl rounded-br-sm bg-foreground px-3.5 py-2.5 text-background">
              Can I change plans later?
            </p>
          </Step>

          <Step delay={900}>
            <div className="space-y-2">
              <p className="rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5 leading-relaxed">
                Yes. Upgrades take effect immediately and you pay the price difference.
                <sup className="ml-0.5 font-medium text-signal">1</sup>
              </p>
              <p className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                <span className="font-medium text-signal">1</span> Pricing: Can I change plans later?
              </p>
            </div>
          </Step>

          <Step delay={1900} align="end">
            <p className="rounded-2xl rounded-br-sm bg-foreground px-3.5 py-2.5 text-background">
              Please refund my last invoice.
            </p>
          </Step>

          <Step delay={2600}>
            <div className="flex items-start gap-2.5 rounded-xl border border-dashed px-3 py-2.5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-foreground" />
              <p className="leading-relaxed">
                <span className="font-medium text-foreground">Waiting for approval.</span> A person on the team
                reviews refunds before anything happens.
              </p>
            </div>
          </Step>
        </div>

        <div className="flex items-center gap-2 border-t p-3">
          <p className="flex h-10 flex-1 items-center rounded-xl border px-3 text-muted-foreground">
            Ask a question
            <span aria-hidden className="ml-0.5 inline-block h-4 w-px animate-caret bg-foreground" />
          </p>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
            <ArrowUp className="size-5" />
          </span>
        </div>
      </div>
    </div>
  );
}

function Step({
  children,
  delay,
  align = "start",
}: {
  children: React.ReactNode;
  delay: number;
  align?: "start" | "end";
}) {
  return (
    <div
      className={cn("flex animate-rise", align === "end" ? "justify-end" : "justify-start")}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="max-w-[85%]">{children}</div>
    </div>
  );
}

/** The passage the answer was retrieved from, sitting behind the widget. */
function SourceSheet({ className }: { className?: string }) {
  return (
    <figure
      aria-hidden
      className={cn(
        "animate-rise rounded-xl border bg-background p-4 text-xs shadow-[0_16px_32px_-16px_oklch(0_0_0/0.25)]",
        className,
      )}
      style={{ animationDelay: "1300ms" }}
    >
      <figcaption className="mb-3 flex items-center gap-1.5 text-muted-foreground">
        <FileText className="size-3.5" /> pricing / questions
      </figcaption>
      <p className="font-medium">Can I change plans later?</p>
      <p className="mt-1.5 leading-relaxed text-muted-foreground">
        <mark className="rounded-sm bg-signal/15 text-foreground decoration-signal underline-offset-2 [box-decoration-break:clone] underline">
          Yes. Upgrades take effect immediately and you pay the price difference.
        </mark>{" "}
        Moving to Free keeps your paid features until the end of the billing period.
      </p>
    </figure>
  );
}
