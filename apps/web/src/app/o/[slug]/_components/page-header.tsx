import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <span className="text-sm font-medium">{title}</span>
      </header>
      <div className="flex flex-wrap items-end justify-between gap-4 px-6 pt-10 pb-8">
        <div className="max-w-2xl space-y-1.5">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </>
  );
}

export function PageBody({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6 px-6 pb-10">{children}</div>;
}
