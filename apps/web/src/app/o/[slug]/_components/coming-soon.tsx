import type { LucideIcon } from "lucide-react";
import { PageBody, PageHeader } from "./page-header";

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
        <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
          <div className="mb-4 rounded-full bg-muted p-3">
            <Icon className="size-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">{title} is on the way</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
          <ul className="mt-6 grid gap-2 text-left text-sm text-muted-foreground sm:grid-cols-2">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-muted-foreground/40" /> {f}
              </li>
            ))}
          </ul>
        </div>
      </PageBody>
    </>
  );
}
