"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PRESETS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

/** Today's date in the viewer's time zone, as YYYY-MM-DD. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function minusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function RangePicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [custom, setCustom] = useState({ from, to });

  const go = (next: { from: string; to: string }) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    router.push(`${pathname}?${new URLSearchParams({ from: next.from, to: next.to, tz })}`);
  };

  // Reports are computed in the viewer's time zone; add it on first visit.
  useEffect(() => {
    if (!params.get("tz")) {
      const end = today();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      router.replace(`${pathname}?${new URLSearchParams({ from: minusDays(end, 29), to: end, tz })}`);
    }
  }, [params, pathname, router]);

  const end = today();
  const active = PRESETS.find((p) => to === end && from === minusDays(end, p.days - 1))?.days;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border p-0.5" role="group" aria-label="Date range">
        {PRESETS.map((p) => (
          <Button
            key={p.days}
            size="sm"
            variant={active === p.days ? "secondary" : "ghost"}
            aria-pressed={active === p.days}
            onClick={() => go({ from: minusDays(end, p.days - 1), to: end })}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.from && custom.to && custom.from <= custom.to) go(custom);
        }}
      >
        <Input
          type="date"
          aria-label="From"
          className="h-8 w-36"
          value={custom.from}
          max={custom.to}
          onChange={(e) => setCustom({ ...custom, from: e.target.value })}
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          aria-label="To"
          className="h-8 w-36"
          value={custom.to}
          min={custom.from}
          max={end}
          onChange={(e) => setCustom({ ...custom, to: e.target.value })}
        />
        <Button size="sm" variant="outline" type="submit">
          Apply
        </Button>
      </form>
    </div>
  );
}
