import { BookOpenCheck, ShieldCheck, Ticket } from "lucide-react";
import { Logo } from "@/components/logo";

const points = [
  { icon: BookOpenCheck, text: "Answers grounded in your own docs, with sources" },
  { icon: Ticket, text: "Hands hard questions to your team as tickets" },
  { icon: ShieldCheck, text: "Sensitive actions wait for human approval" },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-foreground p-10 text-background lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(var(--color-background)_1px,transparent_1px),linear-gradient(90deg,var(--color-background)_1px,transparent_1px)] bg-size-[48px_48px] opacity-[0.06] mask-[linear-gradient(to_bottom,black,transparent_80%)]"
        />
        <Logo className="relative w-fit text-background [&_path]:stroke-foreground [&_rect]:fill-background" />

        <div className="relative max-w-md animate-rise space-y-10">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight">
            Customer support that knows your product as well as your best agent.
          </h1>
          <ul className="divide-y divide-background/10 border-y border-background/10">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-4 py-4 text-background/75">
                <Icon className="size-5 shrink-0 text-signal" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <svg
            aria-hidden
            viewBox="0 0 400 48"
            preserveAspectRatio="none"
            className="-mx-10 mb-6 block h-12 w-[calc(100%+5rem)] text-background/20"
          >
            <path
              d="M0 40 H150 c14 0 18 -26 30 -26 s16 34 30 34 s16 -40 30 -40 s14 30 22 30 H400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <p className="text-sm text-background/50">© {new Date().getFullYear()} Groundline</p>
        </div>
      </aside>

      <main className="flex flex-col p-6 sm:p-10">
        <Logo className="w-fit lg:hidden" />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-rise [animation-delay:120ms]">{children}</div>
        </div>
      </main>
    </div>
  );
}
