import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/lib/role";
import { EmployeeFormFields, EmpFields, blankEmp, validateEmp } from "@/components/EmployeeFormFields";
import { EmployeePhoto } from "@/components/EmployeePhoto";

type Sup = {
  id: string; name: string; user_id: string | null; photo_url: string | null;
  scrum_id: string | null; mobile: string | null; aadhar: string | null; gender: string | null;
  employee_type_id: string | null;
};

export default function Supervisors() {
  const { refreshSupervisors } = useRole();
  const [list, setList] = useState<Sup[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [emp, setEmp] = useState<EmpFields>(blankEmp);
  const [search, setSearch] = useState("");

  const load = async () => {
    const { data } = await supabase.from("supervisors").select("*").order("name");
    setList((data as any) || []);
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setEditingId(null); setEmp(blankEmp); };
  const openNew = () => { reset(); setOpen(true); };
  const openEdit = (s: Sup) => {
    setEditingId(s.id);
    setEmp({
      name: s.name, scrum_id: s.scrum_id || "", mobile: s.mobile || "",
      aadhar: s.aadhar || "", gender: s.gender || "",
      employee_type_id: s.employee_type_id || "",
      photo_url: s.photo_url || "",
    });
    setOpen(true);
  };

  const save = async () => {
    const err = validateEmp(emp);
    if (err) return toast.error(err);
    const payload: any = {
      name: emp.name, scrum_id: emp.scrum_id || null, mobile: emp.mobile || null, aadhar: emp.aadhar || null,
      gender: emp.gender || null, employee_type_id: emp.employee_type_id,
      photo_url: emp.photo_url || null,
    };
    const { error } = editingId
      ? await supabase.from("supervisors").update(payload).eq("id", editingId)
      : await supabase.from("supervisors").insert(payload);
    if (error) toast.error(error.message);
    else {
      toast.success(editingId ? "Supervisor updated" : "Supervisor added");
      setOpen(false); reset(); load(); refreshSupervisors();
    }
  };
  const remove = async (id: string) => {
    if (!confirm("Delete supervisor?")) return;
    await supabase.from("supervisors").delete().eq("id", id);
    load(); refreshSupervisors();
  };

  const filtered = list.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q)
      || (s.aadhar || "").includes(search)
      || (s.mobile || "").includes(search)
      || (s.scrum_id || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-xl font-semibold">Supervisors <span className="text-sm text-muted-foreground font-normal">({filtered.length})</span></h2>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4" />Add</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? "Edit Supervisor" : "New Supervisor"}</DialogTitle></DialogHeader>
            <EmployeeFormFields value={emp} onChange={setEmp} defaultType="Supervisor" hideType photoRole="supervisor" />
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Input placeholder="Search name, Aadhar, mobile, Scrum ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="grid gap-2">
        {filtered.map((s) => (
          <Card key={s.id} className="p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <EmployeePhoto path={s.photo_url} name={s.name} subtitle={s.scrum_id || undefined} />
              <div className="min-w-0">
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-muted-foreground">
                {s.scrum_id && <span>ID: {s.scrum_id} </span>}
                {s.mobile && <span>· 📱 {s.mobile} </span>}
                {s.aadhar && <span>· Aadhar {s.aadhar.slice(0,4)}…{s.aadhar.slice(-4)}</span>}
              </div>
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
