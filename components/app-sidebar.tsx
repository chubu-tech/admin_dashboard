"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardCheck, Mail, Scissors, Store, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { SignOutButton } from "@/components/sign-out-button";

const NAV = [
  { href: "/", label: "Overview", icon: BarChart3, exact: true },
  { href: "/approvals", label: "Salon approval", icon: ClipboardCheck },
  { href: "/salons", label: "Salon management", icon: Store },
  { href: "/users", label: "User management", icon: Users },
  { href: "/waitlist", label: "App waitlist", icon: Mail },
];

export function AppSidebar({
  adminName,
  adminEmail,
}: {
  adminName: string;
  adminEmail: string;
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-lg">
            <Scissors className="size-4" aria-hidden />
          </span>
          <div className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold">
              Bhutan Salons
            </span>
            <span className="text-muted-foreground truncate text-xs">
              Admin console
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <item.icon aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:hidden">
          <div className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-sm font-medium">{adminName}</span>
            <span className="text-muted-foreground truncate text-xs">
              {adminEmail}
            </span>
          </div>
        </div>
        <SignOutButton />
      </SidebarFooter>
    </Sidebar>
  );
}
