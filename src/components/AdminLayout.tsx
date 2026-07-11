import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { FileText, ShoppingCart, Users, HardHat, UserCog, Building2, Package, Ruler, Tag, Wallet, LayoutDashboard, ShieldCheck, History, UsersRound, PieChart, Calculator, ClipboardList, MapPin, FileBarChart2, ScanFace } from "lucide-react";
import { RoleSwitcher } from "./RoleSwitcher";
import { useRole } from "@/lib/role";
import logo from "@/assets/velston-logo.png";

const items = [
  { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Quotations", url: "/admin/quotations", icon: FileText },
  { title: "Purchase Orders", url: "/admin/purchase-orders", icon: ShoppingCart },
  { title: "Assignments", url: "/admin/assignments", icon: ClipboardList },
  { title: "Daily Reports", url: "/admin/reports", icon: FileBarChart2 },
  { title: "Attendance", url: "/admin/attendance", icon: ScanFace },
  { title: "Users", url: "/admin/users", icon: ShieldCheck },
  { title: "Daily Wages", url: "/admin/daily-wages", icon: Wallet },
  { title: "Wage Share", url: "/admin/wage-share", icon: PieChart },
  { title: "Wage Recalc", url: "/admin/wage-recalc", icon: Calculator },
  { title: "Wage Edit Log", url: "/admin/wage-edits", icon: History },
];

const employees = [
  { title: "All Employees", url: "/admin/employees", icon: UsersRound },
  { title: "Workers", url: "/admin/workers", icon: HardHat },
  { title: "Supervisors", url: "/admin/supervisors", icon: UserCog },
  { title: "Contractors", url: "/admin/contractors", icon: Users },
];

const masters = [
  { title: "Clients", url: "/admin/masters/clients", icon: Building2 },
  { title: "Item Catalog", url: "/admin/masters/items", icon: Package },
  { title: "UoM", url: "/admin/masters/uoms", icon: Ruler },
  { title: "Designations", url: "/admin/masters/designations", icon: Tag },
];

const bottomNav = [
  { to: "/admin/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/admin/quotations", label: "Quotes", icon: FileText },
  { to: "/admin/masters/clients", label: "Clients", icon: Building2 },
  { to: "/admin/workers", label: "Workers", icon: HardHat },
  { to: "/admin/daily-wages", label: "Wages", icon: Wallet },
];

function AppSidebar() {
  const { state, setOpenMobile, isMobile } = useSidebar();
  const { realRole } = useRole();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const close = () => { if (isMobile) setOpenMobile(false); };
  const visibleItems = items.filter((i) => i.url !== "/admin/users" || realRole === "admin" || realRole === "super_admin");
  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="p-4 flex items-center gap-2 text-sidebar-foreground font-bold text-base">
          <img src={logo} alt="Velston Projects" className="h-8 w-8 shrink-0 rounded-full bg-white/10" />
          {!collapsed && <span className="leading-tight">Velston<br/>Projects</span>}
        </div>
        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.url)} className="h-12 text-base px-3">
                    <NavLink to={item.url} onClick={close} className="flex items-center gap-3">
                      <item.icon className="h-5 w-5" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Employees</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {employees.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.url} className="h-12 text-base px-3">
                    <NavLink to={item.url} onClick={close} className="flex items-center gap-3">
                      <item.icon className="h-5 w-5" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Masters</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {masters.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.url)} className="h-12 text-base px-3">
                    <NavLink to={item.url} onClick={close} className="flex items-center gap-3">
                      <item.icon className="h-5 w-5" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export default function AdminLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b px-3 bg-background sticky top-0 z-10">
            <div className="flex items-center gap-2 min-w-0">
              <SidebarTrigger />
              <h1 className="font-semibold text-base md:text-lg truncate">Admin</h1>
            </div>
            <RoleSwitcher />
          </header>
          <main className="flex-1 p-3 sm:p-4 md:p-6 pb-nav sm:pb-6 bg-muted/30 min-w-0">
            <Outlet />
          </main>
          <nav
            className="sm:hidden fixed left-0 right-0 bg-background border-t flex z-20 pb-safe"
            style={{ bottom: 0 }}
          >
            {bottomNav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center justify-center py-2.5 min-h-[56px] text-[11px] gap-0.5 ${
                    isActive ? "text-primary font-semibold" : "text-muted-foreground"
                  }`
                }
              >
                <n.icon className="h-5 w-5" />
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </SidebarProvider>
  );
}
