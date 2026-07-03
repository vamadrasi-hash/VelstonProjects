import { Navigate } from "react-router-dom";
import { useRole } from "@/lib/role";

const Index = () => {
  const { user, loading, isApproved, role } = useRole();
  // Safety net: if Supabase landed a password-recovery session here, send to reset page.
  if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
    return <Navigate to={`/reset-password${window.location.hash}`} replace />;
  }
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isApproved) return <Navigate to="/pending-approval" replace />;
  return <Navigate to={role === "supervisor" ? "/sup/status" : "/admin/dashboard"} replace />;
};

export default Index;
