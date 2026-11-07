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
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-zinc-950 p-10 text-zinc-50 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(60%_50%_at_20%_10%,#3f3f46_0%,transparent_70%)]"
        />
        <Logo className="relative text-zinc-50 [&_rect]:fill-zinc-50 [&_path]:stroke-zinc-950" />
        <div className="relative max-w-md space-y-8">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Customer support that knows your product as well as your best agent.
          </h1>
          <ul className="space-y-4 text-zinc-300">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <Icon className="size-5 shrink-0 text-zinc-400" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-zinc-500">© {new Date().getFullYear()} Groundline</p>
      </aside>
      <main className="flex flex-col p-6 sm:p-10">
        <Logo className="lg:hidden" />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
