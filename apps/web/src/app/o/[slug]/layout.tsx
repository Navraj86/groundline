import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireOrg } from "@/lib/auth";
import { AppSidebar } from "./_components/app-sidebar";

export default async function OrgLayout({ children, params }: LayoutProps<"/o/[slug]">) {
  const { slug } = await params;
  const { me, org } = await requireOrg(slug);
  // Remember whether the sidebar was collapsed (the sidebar component writes this cookie).
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar me={me} org={org} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
