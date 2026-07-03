import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";

type Row = {
  user_id: string;
  full_name: string;
  mobile: string;
  email: string;
  status: "pending" | "approved" | "rejected";
  role: "super_admin" | "admin" | "supervisor" | null;
};

type SupervisorLite = { id: string; name: string; user_id: string | null };
type AppRole = "admin" | "supervisor";

const NEW_SUP = "__new__";

export default function Users() {
  const { realRole, refreshSupervisors } = useRole();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [unlinkedSups, setUnlinkedSups] = useState<SupervisorLite[]>([]);
  // per-row chosen supervisor link: user_id -> supervisor_id or NEW_SUP
  const [linkChoice, setLinkChoice] = useState<Record<string, string>>({});

  const load = async () => {
    const [{ data: profs }, { data: roles }, { data: sups }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("supervisors").select("id,name,user_id").is("user_id", null).order("name"),
    ]);
    const roleMap: Record<string, Row["role"]> = {};
    (roles || []).forEach((r: any) => {
      const cur = roleMap[r.user_id];
      const rank = { super_admin: 3, admin: 2, supervisor: 1 } as const;
      if (!cur || rank[r.role as keyof typeof rank] > rank[cur as keyof typeof rank]) roleMap[r.user_id] = r.role;
    });
    setRows((profs || []).map((p: any) => ({
      user_id: p.user_id, full_name: p.full_name, mobile: p.mobile, email: p.email,
      status: p.status, role: roleMap[p.user_id] || null,
    })));
    setUnlinkedSups((sups as any) || []);
  };

  useEffect(() => { load(); }, []);

  const linkSupervisor = async (r: Row): Promise<{ ok: boolean; err?: string }> => {
    const choice = linkChoice[r.user_id] || NEW_SUP;
    // Already linked?
    const { data: existing } = await supabase.from("supervisors").select("id").eq("user_id", r.user_id).maybeSingle();
    if (existing) return { ok: true };
    if (choice === NEW_SUP) {
      const { error } = await supabase.from("supervisors").insert({ name: r.full_name || r.email, user_id: r.user_id });
      return { ok: !error, err: error?.message };
    } else {
      const { error } = await supabase.from("supervisors").update({ user_id: r.user_id }).eq("id", choice);
      return { ok: !error, err: error?.message };
    }
  };

  const approveAs = async (r: Row, role: AppRole) => {
    setBusy(r.user_id);
    const me = (await supabase.auth.getUser()).data.user?.id;
    await supabase.from("user_roles").delete().eq("user_id", r.user_id).in("role", ["admin", "supervisor"]);
    const { error: re } = await supabase.from("user_roles").insert({ user_id: r.user_id, role });
    if (re) { setBusy(null); return toast({ title: "Failed", description: re.message, variant: "destructive" }); }

    if (role === "supervisor") {
      const res = await linkSupervisor(r);
      if (!res.ok) { setBusy(null); return toast({ title: "Failed to link supervisor", description: res.err, variant: "destructive" }); }
    }

    const { error: pe } = await supabase.from("profiles").update({
      status: "approved", approved_by: me, approved_at: new Date().toISOString(),
    }).eq("user_id", r.user_id);
    setBusy(null);
    if (pe) return toast({ title: "Failed", description: pe.message, variant: "destructive" });
    toast({ title: "Approved", description: `${r.full_name || r.email} → ${role}` });
    await refreshSupervisors();
    load();
  };

  const reject = async (r: Row) => {
    setBusy(r.user_id);
    await supabase.from("profiles").update({ status: "rejected" }).eq("user_id", r.user_id);
    setBusy(null);
    load();
  };

  const changeRole = async (r: Row, role: AppRole) => {
    setBusy(r.user_id);
    await supabase.from("user_roles").delete().eq("user_id", r.user_id).in("role", ["admin", "supervisor"]);
    await supabase.from("user_roles").insert({ user_id: r.user_id, role });
    if (role === "supervisor") {
      const res = await linkSupervisor(r);
      if (!res.ok) { setBusy(null); return toast({ title: "Failed to link supervisor", description: res.err, variant: "destructive" }); }
    } else {
      await supabase.from("supervisors").update({ user_id: null }).eq("user_id", r.user_id);
    }
    setBusy(null);
    await refreshSupervisors();
    load();
  };

  const revoke = async (r: Row) => {
    setBusy(r.user_id);
    await supabase.from("user_roles").delete().eq("user_id", r.user_id).in("role", ["admin", "supervisor"]);
    await supabase.from("supervisors").update({ user_id: null }).eq("user_id", r.user_id);
    await supabase.from("profiles").update({ status: "pending", approved_by: null, approved_at: null }).eq("user_id", r.user_id);
    setBusy(null);
    await refreshSupervisors();
    load();
  };

  const pending = rows.filter((r) => r.status === "pending");
  const approved = rows.filter((r) => r.status === "approved");
  const rejected = rows.filter((r) => r.status === "rejected");

  const SupSelect = ({ r }: { r: Row }) => (
    <Select
      value={linkChoice[r.user_id] || NEW_SUP}
      onValueChange={(v) => setLinkChoice((p) => ({ ...p, [r.user_id]: v }))}
    >
      <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NEW_SUP}>Create new supervisor</SelectItem>
        {unlinkedSups.map((s) => (
          <SelectItem key={s.id} value={s.id}>Link to: {s.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Users</h2>
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({approved.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejected.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-2">
          {pending.length === 0 && <Card className="p-6 text-center text-muted-foreground text-sm">No pending users.</Card>}
          {pending.map((r) => (
            <Card key={r.user_id} className="p-3 flex flex-wrap items-center gap-3 justify-between">
              <div className="min-w-0">
                <div className="font-semibold">{r.full_name || "—"}</div>
                <div className="text-xs text-muted-foreground">{r.email} · {r.mobile || "no mobile"}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SupSelect r={r} />
                <Button size="sm" disabled={busy === r.user_id} onClick={() => approveAs(r, "supervisor")}>Approve as Supervisor</Button>
                <Button size="sm" variant="secondary" disabled={busy === r.user_id} onClick={() => approveAs(r, "admin")}>Approve as Admin</Button>
                <Button size="sm" variant="destructive" disabled={busy === r.user_id} onClick={() => reject(r)}>Reject</Button>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="approved" className="space-y-2">
          {approved.map((r) => (
            <Card key={r.user_id} className="p-3 flex flex-wrap items-center gap-3 justify-between">
              <div className="min-w-0">
                <div className="font-semibold flex items-center gap-2">
                  {r.full_name || "—"} <Badge variant="outline">{r.role || "—"}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{r.email} · {r.mobile || "no mobile"}</div>
              </div>
              {r.role !== "super_admin" && (
                <div className="flex flex-wrap items-center gap-2">
                  {r.role !== "supervisor" && <SupSelect r={r} />}
                  <Select value={r.role || ""} onValueChange={(v) => changeRole(r, v as AppRole)}>
                    <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="destructive" disabled={busy === r.user_id} onClick={() => revoke(r)}>Revoke</Button>
                </div>
              )}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-2">
          {rejected.map((r) => (
            <Card key={r.user_id} className="p-3 flex flex-wrap items-center gap-3 justify-between">
              <div>
                <div className="font-semibold">{r.full_name || "—"}</div>
                <div className="text-xs text-muted-foreground">{r.email}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => approveAs(r, "supervisor")}>Reconsider</Button>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
