import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useMaster, toOptions } from "@/lib/masters";
import { EmployeeFormFields, EmpFields, blankEmp, validateEmp } from "@/components/EmployeeFormFields";
import { EmployeePhoto } from "@/components/EmployeePhoto";

type Contractor = {
  id: string; name: string; phone: string | null; photo_url: string | null;
  scrum_id: string | null; mobile: string | null; aadhar: string | null; gender: string | null;
  employee_type_id: string | null;
};
type Worker = { id: string; contractor_id: string | null; designation: string };

export default function Contractors() {
  const [list, setList] = useState<Contractor[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [emp, setEmp] = useState<EmpFields>(blankEmp);
  const [search, setSearch] = useState("");
  const [designationFilter, setDesignationFilter] = useState("");
  const { data: designations = [] } = useMaster<{ id: string; name: string }>("designations", "id,name");

  const load = async () => {
    const [{ data: c }, { data: w }] = await Promise.all([
      supabase.from("contractors").select("*").order("name"),
      supabase.from("workers").select("id,contractor_id,designation"),
    ]);
    setList((c as any) || []); setWorkers((w as any) || []);
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setEditingId(null); setEmp(blankEmp); };
  const openNew = () => { reset(); setOpen(true); };
  const openEdit = (c: Contractor) => {
    setEditingId(c.id);
    setEmp({
      name: c.name, scrum_id: c.scrum_id || "", mobile: c.mobile || c.phone || "",
      aadhar: c.aadhar || "", gender: c.gender || "",
      employee_type_id: c.employee_type_id || "",
      photo_url: c.photo_url || "",
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
      phone: emp.mobile || null, // keep legacy phone in sync
    };
    const { error } = editingId
      ? await supabase.from("contractors").update(payload).eq("id", editingId)
      : await supabase.from("contractors").insert(payload);
    if (error) toast.error(error.message);
    else { toast.success(editingId ? "Contractor updated" : "Contractor added"); setOpen(false); reset(); load(); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete contractor?")) return;
    await supabase.from("contractors").delete().eq("id", id); load();
  };

  const filtered = useMemo(() => {
    const dn = designations.find((d) => d.id === designationFilter)?.name?.toLowerCase();
    return list.filter((c) => {
      if (search) {
        const s = search.toLowerCase();
        if (!c.name.toLowerCase().includes(s)
          && !(c.mobile || c.phone || "").includes(search)
          && !(c.aadhar || "").includes(search)
          && !(c.scrum_id || "").toLowerCase().includes(s)) return false;
      }
      if (dn) {
        const has = workers.some((w) => w.contractor_id === c.id && w.designation.toLowerCase() === dn);
        if (!has) return false;
      }
      return true;
    });
  }, [list, workers, search, designationFilter, designations]);

  const countWorkers = (id: string) => workers.filter((w) => w.contractor_id === id).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-xl font-semibold">Contractors <span className="text-sm text-muted-foreground font-normal">({filtered.length})</span></h2>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4" />Add</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? "Edit Contractor" : "New Contractor"}</DialogTitle></DialogHeader>
            <EmployeeFormFields value={emp} onChange={setEmp} defaultType="Contractor" hideType photoRole="contractor" />
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-3 grid sm:grid-cols-2 gap-2">
        <Input placeholder="Search name, Aadhar, mobile, Scrum ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <SearchableSelect
          value={designationFilter} onChange={setDesignationFilter}
          options={toOptions(designations)} placeholder="All designations" allowClear
        />
      </Card>

      <div className="grid gap-2">
        {filtered.map((c) => (
          <Card key={c.id} className="p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <EmployeePhoto path={c.photo_url} name={c.name} subtitle={c.scrum_id || undefined} />
              <div className="min-w-0">
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-muted-foreground">
                {c.scrum_id && <span>ID: {c.scrum_id} </span>}
                {(c.mobile || c.phone) && <span>· 📱 {c.mobile || c.phone} </span>}
                {c.aadhar && <span>· Aadhar {c.aadhar.slice(0,4)}…{c.aadhar.slice(-4)} </span>}
                · {countWorkers(c.id)} worker(s)
              </div>
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
