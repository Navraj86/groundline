import Link from "next/link";
import { cn } from "@/lib/utils";

/** The Groundline mark: a signal resting on a ground line. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)}>
      <rect width="32" height="32" rx="8" className="fill-foreground" />
      <path
        d="M7 19.5c2.2 0 2.9-7 5.1-7s2.6 9 4.9 9 2.6-12 4.9-12 2.2 10 3.1 10"
        fill="none"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-background"
      />
      <path d="M7 24h18" strokeWidth="2.2" strokeLinecap="round" className="stroke-background/60" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className="text-lg">Groundline</span>
    </Link>
  );
}
