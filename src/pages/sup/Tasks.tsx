import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";
import { pct } from "@/lib/progress";
import { AssignmentBadge } from "@/components/AssignmentBadge";
import { expandSeats } from "./_expand";

type Row = {
  id: string; quantity: number;
  line_item_id: string;
  assignment_no: string | null;
  parent_assignment_no: string | null;
  site_id: string | null;
  description: string; uom: string; total_qty: number;
  po_site_text: string; client_name: string;
  work_done: number;
};

export default function Tasks() {
  const { supervisorId } = useRole();
  const [rows, setRows] = useState<Row[]>([]);
  const [siteNames, setSiteNames] = useState<Record<string, string>>({});
  const [siteFilter, setSiteFilter] = useState<string>("all");

  useEffect(() => {
    if (!supervisorId) return;
    (async () => {
      const { data: raw } = await supabase
        .from("line_item_assignments")
        .select("id, quantity, assignment_no, parent_assignment_no, line_item_id, area_id, site_assignment_id, po_line_items(description,uom,quantity,purchase_orders(site,client_name)), site_assignments:site_assignment_id(site_id,area_id)")
        .eq("supervisor_id", supervisorId)
        .is("released_at", null);
      const withArea = (raw || []).map((x: any) => ({
        ...x,
        area_id: x.area_id || x.site_assignments?.area_id || x.site_assignments?.site_id || null,
      }));
      const data = await expandSeats(withArea as any);
      const base: Row[] = (data || []).map((x: any) => ({
        id: x.id,
        quantity: Number(x.quantity),
        line_item_id: x.line_item_id,
        assignment_no: x.assignment_no || null,
        parent_assignment_no: x.parent_assignment_no || null,
        site_id: x.area_id || null,
        description: x.po_line_items?.description || "—",
        uom: x.po_line_items?.uom || "",
        total_qty: Number(x.po_line_items?.quantity || 0),
        po_site_text: x.po_line_items?.purchase_orders?.site || "",
        client_name: x.po_line_items?.purchase_orders?.client_name || "",
        work_done: 0,
      }));
      const lids = Array.from(new Set(base.map((r) => r.line_item_id)));
      if (lids.length) {
        const { data: dl } = await supabase.from("daily_logs").select("line_item_id,work_done").in("line_item_id", lids);
        const dm: Record<string, number> = {};
        (dl || []).forEach((x: any) => { dm[x.line_item_id] = (dm[x.line_item_id] || 0) + Number(x.work_done || 0); });
        base.forEach((r) => (r.work_done = dm[r.line_item_id] || 0));
      }
      const sids = Array.from(new Set(base.map((r) => r.site_id).filter(Boolean))) as string[];
      if (sids.length) {
        const [{ data: ars }, { data: ss }] = await Promise.all([
          supabase.from("areas").select("id,name").in("id", sids),
          supabase.from("sites").select("id,name").in("id", sids),
        ]);
        const m: Record<string, string> = {};
        (ars || []).forEach((s: any) => (m[s.id] = s.name));
        (ss || []).forEach((s: any) => { if (!m[s.id]) m[s.id] = s.name; });
        setSiteNames(m);
      }
      setRows(base);
    })();
  }, [supervisorId]);

  const siteKeyOf = (r: Row) => r.site_id || "__none";
  const siteNameOf = (r: Row) => (r.site_id ? (siteNames[r.site_id] || "Site") : "Unassigned site");

  const siteOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(siteKeyOf(r), siteNameOf(r)));
    return Array.from(m.entries()).sort(([, a], [, b]) => a.localeCompare(b));
  }, [rows, siteNames]);

  const grouped = useMemo(() => {
    const filtered = siteFilter === "all" ? rows : rows.filter((r) => siteKeyOf(r) === siteFilter);
    const m = new Map<string, { name: string; items: Row[] }>();
    filtered.forEach((r) => {
      const k = siteKeyOf(r);
      const g = m.get(k) || { name: siteNameOf(r), items: [] };
      g.items.push(r);
      m.set(k, g);
    });
    return Array.from(m.entries())
      .map(([k, g]) => ({ key: k, ...g }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, siteNames, siteFilter]);

  if (!supervisorId) return <div className="text-muted-foreground">Pick a supervisor in the header.</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">My Tasks <span className="text-sm text-muted-foreground font-normal">({rows.length})</span></h2>
      <Card className="p-3">
        <div className="text-xs text-muted-foreground mb-1">Site</div>
        <Select value={siteFilter} onValueChange={setSiteFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sites</SelectItem>
            {siteOptions.map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>
      {grouped.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">No tasks assigned.</Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {grouped.map((g) => {
            const totalQty = g.items.reduce((s, it) => s + it.total_qty, 0);
            const doneQty = g.items.reduce((s, it) => s + it.work_done, 0);
            return (
              <AccordionItem key={g.key} value={g.key} className="border rounded-md bg-card">
                <AccordionTrigger className="px-3 py-2 hover:no-underline">
                  <div className="flex items-center justify-between w-full gap-2 pr-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="default" className="text-sm shrink-0">📍 {g.name}</Badge>
                      <span className="text-xs text-muted-foreground">{g.items.length} task(s)</span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{pct(doneQty, totalQty).toFixed(0)}%</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-2">
                  <div className="grid gap-2">
                    {g.items.map((it) => (
                      <Link key={it.id} to={`/sup/allotment/${it.line_item_id}`} className="block">
                        <Card className="p-4 hover:border-primary active:bg-accent/40 transition space-y-2 min-h-[88px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <AssignmentBadge no={it.assignment_no} size="md" />
                            {it.parent_assignment_no && (
                              <span className="text-[10px] text-muted-foreground">of {it.parent_assignment_no}</span>
                            )}
                          </div>
                          <div className="font-semibold leading-snug break-words">{it.description}</div>
                          {it.client_name && (
                            <div className="text-xs text-muted-foreground break-words">{it.client_name}</div>
                          )}
                          <div className="text-sm text-muted-foreground flex flex-wrap gap-x-2">
                            <span>My Qty: <span className="text-foreground font-medium">{it.quantity}</span> / {it.total_qty}</span>
                            <Badge variant="outline">{it.uom}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Progress value={pct(it.work_done, it.total_qty)} className="flex-1 h-2" />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {pct(it.work_done, it.total_qty).toFixed(0)}%
                            </span>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
