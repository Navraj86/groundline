import type { ReactNode } from "react";

/**
 * Renders the small subset of Markdown that answers use (paragraphs, bullet and numbered
 * lists, **bold**) plus [n] citation markers, without injecting HTML.
 */
export function renderAnswer(text: string): ReactNode[] {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return blocks.map((block, i) => {
    const lines = block.split("\n").filter((l) => l.trim());
    const bullets = lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
    if (bullets && lines.length > 0) {
      const ordered = /^\s*\d+[.)]/.test(lines[0]!);
      const items = lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""))}</li>);
      return ordered ? (
        <ol key={i} className="list-decimal space-y-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={i} className="list-disc space-y-1 pl-5">
          {items}
        </ul>
      );
    }
    return (
      <p key={i} className="whitespace-pre-line">
        {inline(block)}
      </p>
    );
  });
}

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d{1,2}\])/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const cite = part.match(/^\[(\d{1,2})\]$/);
    if (cite) {
      return (
        <sup key={i} className="ml-0.5 rounded bg-foreground/10 px-1 text-[10px] font-medium">
          {cite[1]}
        </sup>
      );
    }
    return part;
  });
}
