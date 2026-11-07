import type { AuditLogEntry } from "@groundline/shared";
import { ROLE_LABELS, type OrgRole } from "@groundline/shared";

export function initials(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
const relativeFmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

export const isPast = (iso: string) => new Date(iso).getTime() <= Date.now();

export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relativeFmt.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

const role = (value: unknown) => ROLE_LABELS[value as OrgRole] ?? String(value);

/** A human-readable sentence for an audit log entry. */
export function describeActivity(entry: AuditLogEntry): string {
  const m = entry.metadata as Record<string, unknown>;
  switch (entry.action) {
    case "organization.created":
      return `created the workspace “${m.name}”`;
    case "organization.updated": {
      const changes = Object.keys((m.changes as object) ?? {});
      return changes.length ? `updated the workspace ${changes.join(" and ")}` : "updated the workspace";
    }
    case "invitation.created":
      return `invited ${m.email} as ${role(m.role)}`;
    case "invitation.revoked":
      return `cancelled the invitation for ${m.email}`;
    case "member.joined":
      return `joined as ${role(m.role)}`;
    case "member.role_changed":
      return `changed ${m.email}'s role from ${role(m.from)} to ${role(m.to)}`;
    case "member.removed":
      return `removed ${m.email} from the workspace`;
    case "member.left":
      return "left the workspace";
    default:
      return entry.action.replace(/[._]/g, " ");
  }
}
