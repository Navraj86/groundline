import type { AuditLogEntry } from "@groundline/shared";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { describeActivity, formatDateTime, formatRelative, initials } from "@/lib/format";

export function ActivityList({ items, empty = "No activity yet." }: { items: AuditLogEntry[]; empty?: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;

  return (
    <ol className="divide-y">
      {items.map((entry) => {
        const who = entry.actor?.fullName ?? entry.actor?.email ?? "Someone";
        return (
          <li key={entry.id} className="flex items-start gap-3 py-3">
            <Avatar className="size-7">
              <AvatarFallback className="text-[11px]">{initials(who)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 text-sm">
              <p>
                <span className="font-medium">{who}</span> {describeActivity(entry)}
              </p>
              <time dateTime={entry.createdAt} title={formatDateTime(entry.createdAt)} className="text-xs text-muted-foreground">
                {formatRelative(entry.createdAt)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
