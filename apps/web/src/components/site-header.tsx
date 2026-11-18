import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/** The public pages' top bar: the wordmark, pricing, and the way in. */
export function SiteHeader({ current }: { current?: "pricing" }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="flex items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden aria-[current=page]:bg-muted sm:inline-flex"
          >
            <Link href="/pricing" aria-current={current === "pricing" ? "page" : undefined}>
              Pricing
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="ml-1">
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
