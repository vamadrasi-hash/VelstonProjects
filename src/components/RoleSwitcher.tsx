import { useRole } from "@/lib/role";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

export function RoleSwitcher() {
  const { realRole, profile, supervisors, impersonateKey, setImpersonateKey, signOut } = useRole();
  const navigate = useNavigate();

  const onChange = (v: string) => {
    setImpersonateKey(v);
    if (v === "self" || v === "admin") navigate("/admin/dashboard");
    else if (v.startsWith("sup:")) navigate("/sup/status");
  };

  const onLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  if (realRole === "super_admin" || realRole === "admin") {
    const selfLabel = realRole === "super_admin" ? "Super Admin (me)" : "Admin (me)";
    return (
      <div className="flex items-center gap-2">
        <Select value={impersonateKey} onValueChange={onChange}>
          <SelectTrigger className="w-[220px] bg-background">
            <SelectValue placeholder="View as…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="self">{selfLabel}</SelectItem>
            {realRole === "super_admin" && <SelectItem value="admin">Admin view</SelectItem>}
            {supervisors.map((s) => (
              <SelectItem key={s.id} value={`sup:${s.id}`}>Supervisor: {s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={onLogout} title="Logout"><LogOut className="h-4 w-4" /></Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground hidden sm:inline">{profile?.full_name || profile?.email}</span>
      <Button variant="ghost" size="sm" onClick={onLogout}><LogOut className="h-4 w-4 mr-1" />Logout</Button>
    </div>
  );
}
