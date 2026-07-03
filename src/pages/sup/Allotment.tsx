import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { StickyActionBar } from "@/components/StickyActionBar";
import { PageHeader } from "@/components/PageHeader";
import { EmployeePhoto } from "@/components/EmployeePhoto";
import { AssignmentBadge } from "@/components/AssignmentBadge";

type Worker = {
  id: string; name: string; designation: string; contractor_id: string | null;
  is_busy: boolean; current_supervisor_id: string | null; current_line_item_id: string | null;
  aadhar?: string | null; mobile?: string | null; scrum_id?: string | null; photo_url?: string | null;
};
type Contractor = { id: string; name: string };
type Item = { id: string; description: string; uom: string; quantity: number; site?: string; client_name?: string };

export default function Allotment() {
  const { lineItemId } = useParams();
  const { supervisorId, supervisors } = useRole();
  const navigate = useNavigate();
  const [item, setItem] = useState<Item | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [assignmentNos, setAssignmentNos] = useState<string[]>([]);

  const load = async () => {
    const [{ data: it }, { data: ws }, { data: cs }, { data: lis }, asgs] = await Promise.all([
      supabase.from("po_line_items").select("*, purchase_orders(site,client_name)").eq("id", lineItemId!).single(),
      supabase.from("workers").select("*").order("name"),
      supabase.from("contractors").select("id,name").order("name"),
      supabase.from("po_line_items").select("id,description,uom,quantity"),
      supervisorId
        ? supabase.from("line_item_assignments").select("assignment_no").eq("line_item_id", lineItemId!).eq("supervisor_id", supervisorId)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    if (it) {
      const po = (it as any).purchase_orders || {};
      setItem({ ...(it as any), quantity: Number(it.quantity), site: po.site, client_name: po.client_name });
    }
    setWorkers(ws || []); setContractors(cs || []);
    setItems((lis || []).map((x: any) => ({ ...x, quantity: Number(x.quantity) })));
    setAssignmentNos((((asgs as any).data) || []).map((x: any) => x.assignment_no).filter(Boolean));
  };
  useEffect(() => { load(); }, [lineItemId, supervisorId]);


  const toggle = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const assign = async () => {
    if (submitting) return;
    if (selected.size === 0 || !supervisorId || !lineItemId) return;
    setSubmitting(true);
    try {
      const ids = Array.from(selected);
      const { data, error } = await supabase.from("workers").update({
        is_busy: true, current_line_item_id: lineItemId, current_supervisor_id: supervisorId,
      }).in("id", ids).select("id");
      if (error) { toast.error(error.message); return; }
      if (!data || data.length === 0) {
        toast.error("Couldn't assign workers — permission denied or no rows updated.");
        return;
      }
      toast.success(`Assigned ${data.length} worker(s)`);
      setSelected(new Set());
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const cName = (id: string | null) => contractors.find((c) => c.id === id)?.name || "Unknown";
  const sName = (id: string | null) => supervisors.find((s) => s.id === id)?.name || "—";
  const itemDesc = (id: string | null) => items.find((i) => i.id === id)?.description || "—";

  const matchSearch = (w: Worker) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return w.name.toLowerCase().includes(q)
      || (w.aadhar || "").includes(search)
      || (w.mobile || "").includes(search)
      || (w.scrum_id || "").toLowerCase().includes(q);
  };

  const grouped = contractors.map((c) => ({
    contractor: c, workers: workers.filter((w) => w.contractor_id === c.id && matchSearch(w)),
  }));

  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader
        title={item ? item.description : "Allot Workers"}
        subtitle={item ? (
          <div className="space-y-0.5">
            {assignmentNos.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {assignmentNos.map((n) => (
                  <AssignmentBadge key={n} no={n} size="md" />
                ))}
              </div>
            )}
            {(item.site || item.client_name) && (
              <div className="text-xs">{[item.site, item.client_name].filter(Boolean).join(" · ")}</div>
            )}
            <div>Qty: {item.quantity} <Badge variant="outline" className="ml-1">{item.uom}</Badge></div>
          </div>
        ) : undefined}
        backTo="/sup/tasks"
      />

      <Input placeholder="Search worker by name, Aadhar, mobile, Scrum ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="space-y-3">
        {grouped.map(({ contractor, workers: ws }) => (
          <Card key={contractor.id} className="p-3 space-y-2">
            <div className="font-medium text-sm text-primary">{contractor.name}</div>
            {ws.length === 0 && <div className="text-xs text-muted-foreground">No workers</div>}
            {ws.map((w) => {
              const busy = w.is_busy;
              const checked = selected.has(w.id);
              return (
                <label
                  key={w.id}
                  className={`flex items-start gap-3 p-3 rounded border cursor-pointer min-h-[56px] ${
                    busy ? "opacity-60 bg-muted/40 cursor-not-allowed" : checked ? "bg-primary/10 border-primary" : "hover:bg-accent/40"
                  }`}
                >
                  <Checkbox checked={checked} disabled={busy} onCheckedChange={() => !busy && toggle(w.id)} className="mt-1 h-5 w-5" />
                  <EmployeePhoto
                    path={w.photo_url}
                    name={w.name}
                    subtitle={`${w.designation}${w.scrum_id ? ` · ${w.scrum_id}` : ""}${w.mobile ? ` · 📱 ${w.mobile}` : ""}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{w.name}</div>
                    <div className="text-xs text-muted-foreground break-words">
                      {busy
                        ? `[${w.designation}] | ${itemDesc(w.current_line_item_id)} · ${sName(w.current_supervisor_id)}`
                        : w.designation}
                    </div>
                  </div>
                </label>
              );
            })}
          </Card>
        ))}
      </div>
      <StickyActionBar>
        <Button className="w-full shadow-lg h-12 text-base" onClick={assign} disabled={selected.size === 0 || submitting}>
          {submitting ? "Assigning…" : `Assign Team (${selected.size})`}
        </Button>
      </StickyActionBar>
    </div>
  );
}
