"use client";

import { useEffect, useRef, useState } from "react";
import type { DailyPoint } from "@groundline/shared";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const HEIGHT = 220;
const PAD = { top: 12, right: 8, bottom: 24, left: 32 };
const GAP = 2;
const RADIUS = 4;

const SERIES = [
  { key: "handled", label: "Not escalated", color: "var(--series-1)" },
  { key: "escalated", label: "Escalated to the team", color: "var(--series-2)" },
] as const;

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(value));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= value) return m * step;
  return 10 * step;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 8". Formatted by hand so server and browser render the same text. */
function shortDate(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${MONTHS[month! - 1]} ${day}`;
}

/** A bar whose top corners are rounded and whose base sits flat on the baseline or segment below. */
function topRoundedBar(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Widget conversations per day, split by whether they were handed to the team. */
export function DailyChart({ data }: { data: DailyPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry!.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rows = data.map((d) => ({ ...d, handled: Math.max(0, d.conversations - d.escalated) }));
  const max = niceMax(Math.max(0, ...rows.map((r) => r.conversations)));
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(rows.length, 1);
  const barW = Math.max(2, Math.min(28, slot - GAP));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(rows.length / Math.max(2, Math.floor(plotW / 64)));
  const active = hover !== null ? rows[hover] : null;

  return (
    <div className="viz space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
        <Button size="sm" variant="ghost" onClick={() => setAsTable(!asTable)}>
          {asTable ? "Show chart" : "Show table"}
        </Button>
      </div>

      {asTable ? (
        <div className="max-h-72 overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Conversations</TableHead>
                <TableHead className="text-right">Escalated</TableHead>
                <TableHead className="text-right">AI replies</TableHead>
                <TableHead className="text-right">Tickets</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.date}>
                  <TableCell>{shortDate(r.date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.conversations}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.escalated}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.aiReplies}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.tickets}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
          <svg width={width} height={HEIGHT} role="img" aria-label="Conversations per day, split by escalation">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                  {Number.isInteger(t) ? t : t.toFixed(1)}
                </text>
              </g>
            ))}
            {rows.map((r, i) => {
              const x = PAD.left + i * slot + (slot - barW) / 2;
              const handledTop = y(r.handled);
              const handledH = PAD.top + plotH - handledTop;
              const escTop = y(r.conversations);
              // The 2px surface gap separates the two segments.
              const escH = Math.max(0, handledTop - escTop - (r.handled > 0 ? GAP : 0));
              const dim = hover !== null && hover !== i;
              return (
                <g key={r.date} opacity={dim ? 0.45 : 1}>
                  {r.handled > 0 && (
                    <path
                      d={r.escalated > 0 ? `M${x},${handledTop}h${barW}v${handledH}h${-barW}Z` : topRoundedBar(x, handledTop, barW, handledH, RADIUS)}
                      fill={SERIES[0].color}
                    />
                  )}
                  {r.escalated > 0 && escH > 0 && <path d={topRoundedBar(x, escTop, barW, escH, RADIUS)} fill={SERIES[1].color} />}
                  {i % labelEvery === 0 && (
                    <text x={x + barW / 2} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                      {shortDate(r.date)}
                    </text>
                  )}
                  {/* Hit target spans the whole day column, wider and taller than the bar. */}
                  <rect
                    x={PAD.left + i * slot}
                    y={PAD.top}
                    width={slot}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${shortDate(r.date)}: ${r.conversations} conversations, ${r.escalated} escalated`}
                    onPointerMove={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                  />
                </g>
              );
            })}
          </svg>
          {active && hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
              style={{
                left: Math.min(Math.max(PAD.left + hover * slot + slot / 2 - 80, 0), width - 170),
              }}
            >
              <p className="mb-1 font-medium">{shortDate(active.date)}</p>
              {[
                { label: SERIES[0].label, value: active.handled, color: SERIES[0].color },
                { label: SERIES[1].label, value: active.escalated, color: SERIES[1].color },
              ].map((s) => (
                <p key={s.label} className="flex items-center gap-2">
                  <span className="h-0.5 w-3 rounded" style={{ background: s.color }} aria-hidden />
                  <strong className="tabular-nums">{s.value}</strong>
                  <span className="text-muted-foreground">{s.label}</span>
                </p>
              ))}
              <p className="mt-1 text-muted-foreground">
                {active.aiReplies} AI replies · {active.tickets} tickets
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
