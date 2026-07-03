import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { L } from "@/components/BilingualLabel";
import { toast } from "sonner";
import { pct } from "@/lib/progress";
import { usePrimaryForSite } from "@/hooks/usePrimaryForSite";
import { Lock } from "lucide-react";
import { expandSeats } from "./_expand";

type Assign = {
  id: string;
  line_item_id: string;
  quantity: number;
  area_id: string | null;
  site_assignment_id: string | null;
  po_line_items: { description: string; uom: string } | null;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function WorkReport() {
  const { supervisorId } = useRole();
  const [assigns, setAssigns] = useState<Assign[]>([]);
  const [saSite, setSaSite] = useState<Record<string, string>>({});
  const [areaNames, setAreaNames] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, number>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [openLi, setOpenLi] = useState<Assign | null>(null);
  const [qtyInput, setQtyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const primaryMap = usePrimaryForSite(supervisorId);

  const load = async () => {
    if (!supervisorId) return;
    const [{ data: a }, { data: sas }, { data: ars }, { data: dl }, { data: rem }] = await Promise.all([
      supabase.from("line_item_assignments")
        .select("id,line_item_id,quantity,area_id,site_assignment_id,assignment_no,parent_assignment_no,po_line_items(description,uom)")
        .eq("supervisor_id", supervisorId)
        .is("released_at", null),
      supabase.from("site_assignments").select("id,area_id"),
      supabase.from("areas").select("id,name"),
      supabase.from("daily_logs").select("line_item_id,work_done").eq("supervisor_id", supervisorId),
      supabase.from("sup_site_remarks").select("area_id,remark").eq("supervisor_id", supervisorId).eq("work_date", today()),
    ]);
    const expanded = await expandSeats(((a as any) || []) as any);
    setAssigns(expanded as any);
    const sa: Record<string, string> = {};
    ((sas as any) || []).forEach((s: any) => (sa[s.id] = s.area_id || ""));
    setSaSite(sa);
    const am: Record<string, string> = {};
    ((ars as any) || []).forEach((x: any) => (am[x.id] = x.name));
    setAreaNames(am);
    const dm: Record<string, number> = {};
    ((dl as any) || []).forEach((x: any) => { dm[x.line_item_id] = (dm[x.line_item_id] || 0) + Number(x.work_done || 0); });
    setDone(dm);
    const rm: Record<string, string> = {};
    ((rem as any) || []).forEach((r: any) => (rm[r.area_id] = r.remark || ""));
    setRemarks(rm);
  };
  useEffect(() => { load(); }, [supervisorId]);

  const areaOf = (a: Assign) => a.area_id || (a.site_assignment_id ? saSite[a.site_assignment_id] : null);

  const bySite = useMemo(() => {
    const m = new Map<string, Assign[]>();
    assigns.forEach((a) => {
      const k = areaOf(a) || "__none";
      m.set(k, [...(m.get(k) || []), a]);
    });
    return Array.from(m.entries()).map(([k, list]) => ({
      key: k, name: k === "__none" ? "Unassigned" : (areaNames[k] || "—"), list,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [assigns, saSite, areaNames]);

  const openDialog = (a: Assign, isPrimary: boolean) => {
    if (!isPrimary) { toast.error("Read-only · You are not primary for this site"); return; }
    setOpenLi(a); setQtyInput("");
  };

  const saveQty = async () => {
    if (!openLi || !supervisorId) return;
    const n = Number(qtyInput);
    if (!Number.isFinite(n) || n < 0) { toast.error("Enter a valid quantity"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("daily_logs").insert({
        line_item_id: openLi.line_item_id, supervisor_id: supervisorId,
        worker_id: null, contractor_id: null,
        wage_scale: 0, hours: 0, total_wages: 0, contractor_share: 0,
        work_done: n, remark: "",
        date: today(),
      });
      if (error) { toast.error(error.message); return; }
      toast.success("Saved");
      setOpenLi(null);
      await load();
    } finally { setSaving(false); }
  };

  const saveRemark = async (areaId: string, text: string) => {
    if (!supervisorId) return;
    const { error } = await supabase.from("sup_site_remarks").upsert(
      { supervisor_id: supervisorId, area_id: areaId, work_date: today(), remark: text },
      { onConflict: "supervisor_id,area_id,work_date" } as any
    );
    if (error) toast.error(error.message);
    else toast.success("Remark saved");
  };

  if (!supervisorId) {
    return <Card className="p-6 text-center text-muted-foreground text-sm"><L k="pick_supervisor" /></Card>;
  }

  return (
    <div className="space-y-3 pb-24">
      <Card className="p-3">
        <div className="font-semibold"><L k="work_report" layout="inline" /></div>
        <div className="text-xs text-muted-foreground">Today's qty per line item · added to running total</div>
      </Card>

      {bySite.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm"><L k="no_assignments" /></Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {bySite.map((g) => {
            const info = g.key === "__none" ? null : primaryMap[g.key];
            const isPrimary = !info || info.isPrimary;
            return (
            <AccordionItem key={g.key} value={g.key} className={`border rounded-md bg-card border-l-4 ${isPrimary ? "border-l-role-primary" : "border-l-role-assist"}`}>
              <AccordionTrigger className="px-3 py-2 hover:no-underline">
                <div className="flex items-center gap-2 w-full pr-2 min-w-0 flex-wrap">
                  <Badge variant="default" className="text-sm shrink-0">📍 {g.name}</Badge>
                  {isPrimary
                    ? <Badge className="bg-role-primary hover:bg-role-primary text-white text-[10px] px-1.5 py-0">PRIMARY</Badge>
                    : <Badge variant="outline" className="border-role-assist text-role-assist text-[10px] px-1.5 py-0"><Lock className="h-3 w-3 mr-1" />Assist</Badge>}
                  <span className="text-xs text-muted-foreground">{g.list.length} item(s)</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-2 pb-2 space-y-2">
                {!isPrimary && (
                  <div className="text-[11px] text-muted-foreground p-2 border rounded bg-muted/40">
                    Read-only view · Primary: <b>{info?.primaryName || "—"}</b>
                  </div>
                )}
                {g.list.map((a) => {
                  const it = a.po_line_items;
                  const target = Number(a.quantity || 0);
                  const d = Number(done[a.line_item_id] || 0);
                  return (
                    <Card
                      key={a.id}
                      className={`p-3 space-y-2 ${isPrimary ? "cursor-pointer hover:bg-accent/40" : "opacity-70"}`}
                      onClick={() => openDialog(a, isPrimary)}
                    >
                      <div className="font-medium text-sm leading-snug">{it?.description || "—"}</div>
                      <Progress value={pct(d, target)} className="h-2" />
                      <div className="text-[11px] text-muted-foreground">
                        {d.toFixed(1)} / {target} {it?.uom} ({pct(d, target).toFixed(0)}%)
                      </div>
                    </Card>
                  );
                })}
                {g.key !== "__none" && isPrimary && (
                  <div className="p-2 space-y-1">
                    <div className="text-xs text-muted-foreground"><L k="site_remark" oneLine /></div>
                    <Textarea
                      rows={2}
                      value={remarks[g.key] || ""}
                      onChange={(e) => setRemarks((r) => ({ ...r, [g.key]: e.target.value }))}
                      onBlur={(e) => saveRemark(g.key, e.target.value)}
                      placeholder="e.g. plastering work complete on east wall"
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <Dialog open={!!openLi} onOpenChange={(o) => !o && setOpenLi(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm break-words">{openLi?.po_line_items?.description || "—"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Running total: {(done[openLi?.line_item_id || ""] || 0).toFixed(1)} / {openLi?.quantity || 0} {openLi?.po_line_items?.uom}
            </div>
            <div className="text-xs text-muted-foreground"><L k="today_qty" oneLine /> ({openLi?.po_line_items?.uom})</div>
            <Input
              type="number" inputMode="decimal" min={0} step="0.1"
              value={qtyInput} onChange={(e) => setQtyInput(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenLi(null)} disabled={saving}><L k="cancel" oneLine /></Button>
            <Button onClick={saveQty} disabled={saving}>{saving ? "…" : <L k="save" oneLine />}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
