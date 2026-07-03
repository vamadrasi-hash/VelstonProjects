import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash2 } from "lucide-react";
import { useMaster } from "@/lib/masters";

type Row = {
  id: string;
  source: "worker" | "supervisor" | "contractor";
  name: string;
  scrum_id: string | null;
  mobile: string | null;
  aadhar: string | null;
  gender: string | null;
  employee_type_id: string | null;
};

const SOURCE_TO_ROUTE: Record<Row["source"], string> = {
  worker: "/admin/workers",
  supervisor: "/admin/supervisors",
  contractor: "/admin/contractors",
};

export default function Employees() {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "scrum_id" | "type">("name");
  const { data: types = [] } = useMaster<{ id: string; name: string }>("employee_types", "id,name");
  const navigate = useNavigate();

  const load = async () => {
    const [{ data: ws }, { data: ss }, { data: cs }] = await Promise.all([
      supabase.from("workers").select("id,name,scrum_id,mobile,aadhar,gender,employee_type_id"),
      supabase.from("supervisors").select("id,name,scrum_id,mobile,aadhar,gender,employee_type_id"),
      supabase.from("contractors").select("id,name,scrum_id,mobile,aadhar,gender,employee_type_id,phone"),
    ]);
    const all: Row[] = [
      ...((ws as any[]) || []).map((x) => ({ ...x, source: "worker" as const })),
      ...((ss as any[]) || []).map((x) => ({ ...x, source: "supervisor" as const })),
      ...((cs as any[]) || []).map((x) => ({
        ...x, mobile: x.mobile || x.phone, source: "contractor" as const,
      })),
    ];
    setRows(all);
  };
  useEffect(() => { load(); }, []);

  const typeName = (id: string | null) => types.find((t) => t.id === id)?.name || "—";

  const filtered = useMemo(() => {
    let r = rows;
    if (typeFilter !== "all") r = r.filter((x) => x.employee_type_id === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((x) =>
        x.name.toLowerCase().includes(q)
        || (x.aadhar || "").includes(search)
        || (x.mobile || "").includes(search)
        || (x.scrum_id || "").toLowerCase().includes(q)
      );
    }
    r = [...r].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "scrum_id") return (a.scrum_id || "").localeCompare(b.scrum_id || "");
      return typeName(a.employee_type_id).localeCompare(typeName(b.employee_type_id));
    });
    return r;
  }, [rows, search, typeFilter, sortBy, types]);

  const remove = async (r: Row) => {
    if (!confirm(`Delete ${r.source} ${r.name}?`)) return;
    await supabase.from(r.source === "worker" ? "workers" : r.source === "supervisor" ? "supervisors" : "contractors")
      .delete().eq("id", r.id);
    load();
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-semibold">Employees <span className="text-sm text-muted-foreground font-normal">({filtered.length})</span></h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate("/admin/workers")}>+ Worker</Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/admin/supervisors")}>+ Supervisor</Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/admin/contractors")}>+ Contractor</Button>
        </div>
      </div>

      <Card className="p-3 grid sm:grid-cols-3 gap-2">
        <Input placeholder="Search name, Aadhar, mobile, Scrum ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort: Name</SelectItem>
            <SelectItem value="scrum_id">Sort: Scrum ID</SelectItem>
            <SelectItem value="type">Sort: Type</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <div className="grid gap-2">
        {filtered.map((r) => (
          <Card key={`${r.source}-${r.id}`} className="p-3 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-medium flex items-center gap-2 flex-wrap">
                {r.name}
                <Badge variant="secondary" className="capitalize">{r.source}</Badge>
                <Badge variant="outline">{typeName(r.employee_type_id)}</Badge>
              </div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                {r.scrum_id && <span>ID: {r.scrum_id}</span>}
                {r.mobile && <span>· 📱 {r.mobile}</span>}
                {r.aadhar && <span>· Aadhar {r.aadhar.slice(0,4)}…{r.aadhar.slice(-4)}</span>}
                {r.gender && <span>· {r.gender}</span>}
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => navigate(SOURCE_TO_ROUTE[r.source])} title="Edit on source page">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <div className="text-sm text-muted-foreground">No employees match.</div>}
      </div>
    </div>
  );
}
