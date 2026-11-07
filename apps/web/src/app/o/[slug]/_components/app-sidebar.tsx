"use client";

import {
  Activity,
  BarChart3,
  BookOpen,
  Check,
  ChevronsUpDown,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  Plus,
  Settings,
  Ticket,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasPermission, ROLE_LABELS, type Me, type OrganizationSummary, type Permission } from "@groundline/shared";
import { LogoMark } from "@/components/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { initials } from "@/lib/format";
import { signOut } from "../../../(auth)/actions";

type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
  soon?: boolean;
};

const supportNav: NavItem[] = [
  { title: "Overview", href: "", icon: LayoutDashboard },
  { title: "Knowledge base", href: "/knowledge", icon: BookOpen, permission: "knowledge:read", soon: true },
  { title: "Conversations", href: "/conversations", icon: MessagesSquare, permission: "conversations:read", soon: true },
  { title: "Tickets", href: "/tickets", icon: Ticket, permission: "tickets:manage", soon: true },
  { title: "Analytics", href: "/analytics", icon: BarChart3, permission: "analytics:read", soon: true },
];

const workspaceNav: NavItem[] = [
  { title: "Team", href: "/team", icon: Users, permission: "members:read" },
  { title: "Billing", href: "/billing", icon: CreditCard, permission: "billing:read" },
  { title: "Activity", href: "/activity", icon: Activity, permission: "audit:read" },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar({ me, org }: { me: Me; org: OrganizationSummary }) {
  const pathname = usePathname();
  const base = `/o/${org.slug}`;

  const renderItems = (items: NavItem[]) =>
    items
      .filter((item) => !item.permission || hasPermission(org.role, item.permission))
      .map((item) => {
        const href = base + item.href;
        const active = item.href === "" ? pathname === base : pathname.startsWith(href);
        return (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
              <Link href={href}>
                <item.icon />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
            {item.soon && <SidebarMenuBadge className="text-[10px] text-muted-foreground">Soon</SidebarMenuBadge>}
          </SidebarMenuItem>
        );
      });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher me={me} current={org} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Support</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(supportNav)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(workspaceNav)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu me={me} base={base} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function WorkspaceSwitcher({ me, current }: { me: Me; current: OrganizationSummary }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <LogoMark className="size-8" />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">{current.name}</span>
                <span className="truncate text-xs text-muted-foreground">{ROLE_LABELS[current.role]}</span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-60" align="start" side="bottom">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
            {me.organizations.map((o) => (
              <DropdownMenuItem key={o.id} asChild>
                <Link href={`/o/${o.slug}`}>
                  <span className="truncate">{o.name}</span>
                  {o.id === current.id && <Check className="ml-auto" />}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/onboarding">
                <Plus /> Create workspace
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function UserMenu({ me, base }: { me: Me; base: string }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{initials(me.fullName ?? me.email)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{me.fullName ?? me.email}</span>
                <span className="truncate text-xs text-muted-foreground">{me.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" side="top" align="start">
            <DropdownMenuItem asChild>
              <Link href={`${base}/account`}>
                <UserRound /> Account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
