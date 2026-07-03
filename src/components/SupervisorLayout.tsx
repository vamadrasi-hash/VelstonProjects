import { Outlet, NavLink } from "react-router-dom";
import { Activity, Users, ListChecks, Camera, ClipboardList, Wallet } from "lucide-react";
import { RoleSwitcher } from "./RoleSwitcher";
import { useRole } from "@/lib/role";
import logo from "@/assets/velston-logo.png";
import { L } from "./BilingualLabel";

const navs = [
  { to: "/sup/status", k: "status", icon: Activity },
  { to: "/sup/assign", k: "assign", icon: ListChecks },
  { to: "/sup/team", k: "team_today", icon: Users },
  { to: "/sup/photos", k: "photos", icon: Camera },
  { to: "/sup/work-report", k: "work_report", icon: ClipboardList },
  { to: "/sup/wages", k: "wages", icon: Wallet },
];

export default function SupervisorLayout() {
  const { supervisor } = useRole();
  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="h-14 px-3 flex items-center justify-between border-b bg-background sticky top-0 z-10">
        <div className="flex items-center gap-2 font-semibold min-w-0">
          <img src={logo} alt="Velston Projects" className="h-7 w-7 shrink-0" />
          <span className="truncate">Velston Projects</span>
          {supervisor && <span className="text-xs text-muted-foreground hidden sm:inline">· {supervisor.name}</span>}
        </div>
        <RoleSwitcher />
      </header>
      <main className="flex-1 p-3 md:p-6 pb-nav">
        <Outlet />
      </main>
      <nav
        className="fixed left-0 right-0 bg-background border-t flex z-20 pb-safe"
        style={{ bottom: 0 }}
      >
        {navs.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-1.5 min-h-[60px] text-[10px] gap-0.5 ${
                isActive ? "text-primary font-semibold" : "text-muted-foreground"
              }`
            }
          >
            <n.icon className="h-5 w-5" />
            <L k={n.k} className="items-center text-center" />
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
