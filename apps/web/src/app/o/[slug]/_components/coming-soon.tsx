import type { LucideIcon } from "lucide-react";
import { PageBody, PageHeader } from "./page-header";
import { EmptyState } from "./empty-state";

export function ComingSoon({
  title,
  icon: Icon,
  description,
  features,
}: {
  title: string;
  icon: LucideIcon;
  description: string;
  features: string[];
}) {
  return (
    <>
      <PageHeader title={title} />
      <PageBody>
        <EmptyState icon={Icon} title={`${title} is on the way`} description={description}>
          <ul className="mt-6 grid gap-2 text-left text-sm text-muted-foreground sm:grid-cols-2">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-muted-foreground/40" /> {f}
              </li>
            ))}
          </ul>
        </EmptyState>
      </PageBody>
    </>
  );
}
