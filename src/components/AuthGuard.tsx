import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useRole } from "@/lib/role";

export function AuthGuard({ children, require }: { children: ReactNode; require: "admin" | "supervisor" }) {
  const { user, loading, isApproved, role } = useRole();
  const loc = useLocation();

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/auth" state={{ from: loc.pathname }} replace />;
  if (!isApproved) return <Navigate to="/pending-approval" replace />;

  if (require === "admin" && role !== "admin") return <Navigate to="/sup/status" replace />;
  if (require === "supervisor" && role !== "supervisor") return <Navigate to="/admin/dashboard" replace />;

  return <>{children}</>;
}
