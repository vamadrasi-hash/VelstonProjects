import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { pct } from "@/lib/progress";
import { StickyActionBar } from "@/components/StickyActionBar";
import { PageHeader } from "@/components/PageHeader";
import { DatePicker } from "@/components/DatePicker";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertCircle, History } from "lucide-react";

type Worker = {
  id: string; name: string; designation: string; contractor_id: string | null;
  current_line_item_id: string | null; current_supervisor_id: string | null;
  contractor_share_amount: number; daily_rate: number;
};
type Contractor = { id: string; name: string };
type Item = { id: string; description: string; uom: string; quantity: number; site?: string; client_name?: string };

type WorkerRow = { wage: string; hours: string };
type TaskRow = { work: string; remark: string };

const today = () => new Date().toISOString().slice(0, 10);

export default function Report() {
  const { supervisorId } = useRole();
  const [date, setDate] = useState<string>(today());
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [doneMap, setDoneMap] = useState<Record<string, number>>({});
  const [wRows, setWRows] = useState<Record<string, WorkerRow>>({});
  const [tRows, setTRows] = useState<Record<string, TaskRow>>({});
  const [closing, setClosing] = useState(false);
  const [releasingIds, setReleasingIds] = useState<Set<string>>(new Set());
  const [liSite, setLiSite] = useState<Record<string, { id: string; name: string } | null>>({});
  const [siteFilter, setSiteFilter] = useState<string>("all");

  const load = async () => {
    if (!supervisorId) return;
    const [{ data: ws }, { data: cs }, { data: lis }, { data: asgs }, { data: sas }, { data: ars }, { data: stm }] = await Promise.all([
      supabase.from("workers").select("*").eq("is_busy", true).eq("current_supervisor_id", supervisorId),
      supabase.from("contractors").select("id,name"),
      supabase.from("po_line_items").select("id,description,uom,quantity,purchase_orders(site,client_name)"),
      supabase.from("line_item_assignments").select("line_item_id,site_assignment_id").eq("supervisor_id", supervisorId),
      supabase.from("site_assignments").select("id,site_id,area_id"),
      supabase.from("areas").select("id,name"),
      supabase.from("sites").select("id,name"),
    ]);
    setWorkers(ws || []);
    setContractors(cs || []);
    const its = (lis || []).map((x: any) => ({
      ...x,
      quantity: Number(x.quantity),
      site: x.purchase_orders?.site,
      client_name: x.purchase_orders?.client_name,
    }));
    setItems(its);
    const saMap: Record<string, string> = {};
    (sas || []).forEach((s: any) => (saMap[s.id] = s.area_id || s.site_id || ""));
    const nameMap: Record<string, string> = {};
    (ars || []).forEach((a: any) => (nameMap[a.id] = a.name));
    (stm || []).forEach((s: any) => { if (!nameMap[s.id]) nameMap[s.id] = s.name; });
    const lim: Record<string, { id: string; name: string } | null> = {};
    (asgs || []).forEach((a: any) => {
      const sid = a.site_assignment_id ? saMap[a.site_assignment_id] : "";
      if (sid && !lim[a.line_item_id]) lim[a.line_item_id] = { id: sid, name: nameMap[sid] || "—" };
    });
    setLiSite(lim);
    const lids = Array.from(new Set((ws || []).map((w: any) => w.current_line_item_id).filter(Boolean))) as string[];
    if (lids.length) {
      const { data: dl } = await supabase.from("daily_logs").select("line_item_id,work_done").in("line_item_id", lids);
      const dm: Record<string, number> = {};
      (dl || []).forEach((x: any) => { dm[x.line_item_id] = (dm[x.line_item_id] || 0) + Number(x.work_done || 0); });
      setDoneMap(dm);
    } else setDoneMap({});
  };
  useEffect(() => { load(); }, [supervisorId]);

  const setW = (id: string, p: Partial<WorkerRow>) =>
    setWRows((r) => ({ ...r, [id]: { wage: "", hours: "", ...(r[id] || {}), ...p } }));
  const setT = (id: string, p: Partial<TaskRow>) =>
    setTRows((r) => ({ ...r, [id]: { work: "", remark: "", ...(r[id] || {}), ...p } }));

  const total = (id: string) => {
    const r = wRows[id]; if (r?.wage === "" || r?.hours === "" || r?.wage == null || r?.hours == null) return null;
    return Number(r.wage) + Number(r.hours) / 8;
  };
  const workerReady = (id: string) => {
    const r = wRows[id];
    if (r?.wage === "" || r?.hours === "" || r?.wage == null || r?.hours == null) return false;
    return Number(r.wage) + Number(r.hours) > 0;
  };
  const taskReady = (lid: string) => {
    const r = tRows[lid];
    return !!r?.work && Number(r.work) >= 0 && (r.remark?.trim().length || 0) >= 2;
  };

  // group workers by line item
  const groups = useMemo(() => {
    const map = new Map<string, Worker[]>();
    workers.forEach((w) => {
      const k = w.current_line_item_id || "none";
      map.set(k, [...(map.get(k) || []), w]);
    });
    return Array.from(map.entries());
  }, [workers]);

  const groupReady = (lid: string, ws: Worker[]) =>
    taskReady(lid) && ws.every((w) => workerReady(w.id));

  const releaseWorker = async (w: Worker, groupSize: number) => {
    if (releasingIds.has(w.id) || closing) return;
    if (groupSize <= 1) {
      toast.error("Not allowed. Instead try Closing Day");
      return;
    }
    if (!workerReady(w.id)) { toast.error("Fill wage & hours for this worker"); return; }
    setReleasingIds((s) => new Set(s).add(w.id));
    try {
      const r = wRows[w.id];
      const t = Number(r.wage) + Number(r.hours) / 8;
      const share = t * Number(w.contractor_share_amount || 0);
      const { error } = await supabase.from("daily_logs").insert({
        line_item_id: w.current_line_item_id, supervisor_id: supervisorId,
        contractor_id: w.contractor_id, worker_id: w.id,
        wage_scale: Number(r.wage), hours: Number(r.hours), total_wages: t,
        contractor_share: share,
        work_done: 0, remark: "",
        date,
      });
      if (error) { toast.error(error.message); return; }
      await supabase.from("workers").update({
        is_busy: false, current_line_item_id: null, current_supervisor_id: null,
      }).eq("id", w.id);
      toast.success(`Released ${w.name}`);
      await load();
    } finally {
      setReleasingIds((s) => { const n = new Set(s); n.delete(w.id); return n; });
    }
  };

  const closingDay = async () => {
    if (closing) return;
    const notReady = groups.filter(([lid, ws]) => !groupReady(lid, ws));
    if (notReady.length) return toast.error("Fill all tasks (work + remark) and workers (wage + hours)");
    setClosing(true);
    try {
      for (const [lid, ws] of groups) {
        const tr = tRows[lid];
        for (let i = 0; i < ws.length; i++) {
          const w = ws[i];
          const r = wRows[w.id];
          const t = Number(r.wage) + Number(r.hours) / 8;
          const share = t * Number(w.contractor_share_amount || 0);
          const { error } = await supabase.from("daily_logs").insert({
            line_item_id: w.current_line_item_id, supervisor_id: supervisorId,
            contractor_id: w.contractor_id, worker_id: w.id,
            wage_scale: Number(r.wage), hours: Number(r.hours), total_wages: t,
            contractor_share: share,
            work_done: i === 0 ? Number(tr.work) || 0 : 0,
            remark: tr.remark.trim(),
            date,
          });
          if (error) { toast.error(error.message); return; }
          await supabase.from("workers").update({
            is_busy: false, current_line_item_id: null, current_supervisor_id: null,
          }).eq("id", w.id);
        }
      }
      toast.success("Closing day complete");
      await load();
    } finally {
      setClosing(false);
    }
  };

  const cName = (id: string | null) => contractors.find((c) => c.id === id)?.name || "—";
  const item = (id: string | null) => items.find((i) => i.id === id);

  if (!supervisorId) return <div className="text-muted-foreground">Pick a supervisor in the header.</div>;

  const pendingCount = groups.filter(([lid, ws]) => !groupReady(lid, ws)).length;

  const siteKeyOf = (lid: string) => (lid !== "none" && liSite[lid]?.id) || "__none";
  const siteNameOf = (lid: string) => (lid !== "none" && liSite[lid]?.name) || "Unassigned site";

  const siteOptions = (() => {
    const m = new Map<string, string>();
    groups.forEach(([lid]) => m.set(siteKeyOf(lid), siteNameOf(lid)));
    return Array.from(m.entries()).sort(([, a], [, b]) => a.localeCompare(b));
  })();

  const filteredGroups = siteFilter === "all" ? groups : groups.filter(([lid]) => siteKeyOf(lid) === siteFilter);
  const bySite = (() => {
    const m = new Map<string, { name: string; items: typeof groups }>();
    filteredGroups.forEach((g) => {
      const k = siteKeyOf(g[0]);
      const cur = m.get(k) || { name: siteNameOf(g[0]), items: [] as typeof groups };
      cur.items.push(g);
      m.set(k, cur);
    });
    return Array.from(m.entries()).map(([k, v]) => ({ key: k, ...v })).sort((a, b) => a.name.localeCompare(b.name));
  })();

  const renderTaskCard = (lid: string, ws: Worker[]) => {
    const it = item(lid === "none" ? null : lid);
    const tr = tRows[lid] || { work: "", remark: "" };
    const done = it ? (doneMap[it.id] || 0) : 0;
    const projected = done + (Number(tr.work) || 0);
    const targetQty = it?.quantity || 0;
    const gReady = groupReady(lid, ws);
    return (
      <Card key={lid} className={`p-3 space-y-3 border-2 ${gReady ? "border-emerald-500/40 bg-emerald-500/5" : "border-border"}`}>
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground font-medium uppercase">Task</div>
            <div className="font-semibold leading-tight break-words">{it?.description || "Unassigned"}</div>
            {it && (it.site || it.client_name) && (
              <div className="text-[11px] text-muted-foreground break-words mt-0.5">
                {[it.site, it.client_name].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          {gReady ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" /> : <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0" />}
        </div>
        {it && (
          <div className="space-y-1">
            <Progress value={pct(projected, targetQty)} className="h-2" />
            <div className="text-[11px] text-muted-foreground">
              {done.toFixed(1)} → {projected.toFixed(1)} / {targetQty} {it.uom} ({pct(projected, targetQty).toFixed(0)}%)
            </div>
          </div>
        )}
        <div className="space-y-1">
          <div className="text-[11px] text-muted-foreground font-medium">Work done{it ? ` (${it.uom})` : ""} *</div>
          <Input type="number" inputMode="decimal" placeholder="0"
            value={tr.work} onChange={(e) => setT(lid, { work: e.target.value })} />
        </div>
        <div className="space-y-1">
          <div className="text-[11px] text-muted-foreground font-medium">Remark * (min 2 chars)</div>
          <Textarea placeholder="e.g. completed wall plastering" rows={2}
            value={tr.remark} onChange={(e) => setT(lid, { remark: e.target.value })} />
        </div>

        <div className="space-y-2 pt-2 border-t">
          <div className="text-[11px] text-muted-foreground font-medium uppercase">Workers ({ws.length})</div>
          {ws.map((w) => {
            const r = wRows[w.id] || { wage: "", hours: "" };
            const t = total(w.id);
            const wReady = workerReady(w.id);
            const rate = Number(w.daily_rate || 0);
            const shareAmt = Number(w.contractor_share_amount || 0);
            const totalRs = t !== null ? t * rate : 0;
            const contractorRs = Math.min((t ?? 0) * shareAmt, totalRs);
            const workerRs = Math.max(totalRs - contractorRs, 0);
            const contractorName = cName(w.contractor_id);
            return (
              <Card key={w.id} className={`p-2 space-y-2 ${wReady ? "bg-emerald-500/5" : ""}`}>
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-tight break-words text-sm">{w.name}</div>
                    <div className="text-[11px] text-muted-foreground">{w.designation} · Contractor: <b className="text-foreground">{contractorName}</b></div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0 text-right">
                    <div>Total: <span className="font-semibold text-foreground">{t !== null ? t.toFixed(2) : "—"}</span></div>
                    {wReady && rate > 0 && shareAmt > 0 && (
                      <div className="text-[11px] mt-1 flex flex-col gap-0.5">
                        <span>{w.name}: <b className="text-foreground">₹{workerRs.toFixed(0)}</b></span>
                        <span>{contractorName}: <b className="text-foreground">₹{contractorRs.toFixed(0)}</b></span>
                      </div>
                    )}
                    {wReady && rate > 0 && shareAmt === 0 && (
                      <div className="text-[11px] mt-1">₹{totalRs.toFixed(0)}</div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground font-medium">Wage *</div>
                    <Select value={r.wage} onValueChange={(v) => setW(w.id, { wage: v })}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{[0,1,2,3,4,5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground font-medium">Extra Hours *</div>
                    <Select value={r.hours} onValueChange={(v) => setW(w.id, { hours: v })}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{[0,1,2,3,4,5,6,7,8].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" disabled={!wReady || ws.length <= 1 || releasingIds.has(w.id) || closing}
                    onClick={() => releaseWorker(w, ws.length)}>
                    {releasingIds.has(w.id) ? "Releasing…" : "Release Worker"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        {ws.length <= 1 && (
          <div className="text-[11px] text-muted-foreground">
            Last worker on this task — use <b>Close Day</b> to release.
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-4 max-w-4xl pb-32">
      <PageHeader title="Daily Report" subtitle={`${workers.length} worker(s) across ${groups.length} task(s)`} />
      <Card className="p-3 space-y-2">
        <div className="text-xs text-muted-foreground">Work date</div>
        <DatePicker value={date} onChange={setDate} className="w-full sm:w-56" />
        <div className="text-xs text-muted-foreground">All releases below will be logged for this date.</div>
        <Link to="/sup/daily-wages" className="inline-flex items-center gap-1 text-xs text-primary underline pt-1">
          <History className="h-3 w-3" /> Edit / delete past wage entries
        </Link>
      </Card>
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
      {workers.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground text-sm">No workers currently allotted.</Card>
      )}
      {bySite.length > 0 && (
        <Accordion type="multiple" className="space-y-2">
          {bySite.map((g) => {
            const pending = g.items.filter(([lid, ws]) => !groupReady(lid, ws)).length;
            const workerCount = g.items.reduce((s, [, ws]) => s + ws.length, 0);
            return (
              <AccordionItem key={g.key} value={g.key} className="border rounded-md bg-card">
                <AccordionTrigger className="px-3 py-2 hover:no-underline">
                  <div className="flex items-center justify-between w-full gap-2 pr-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="default" className="text-sm shrink-0">📍 {g.name}</Badge>
                      <span className="text-xs text-muted-foreground">{g.items.length} task(s) · {workerCount} worker(s)</span>
                    </div>
                    {pending > 0 && <span className="text-xs text-muted-foreground whitespace-nowrap">{pending} pending</span>}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-2 space-y-3">
                  {g.items.map(([lid, ws]) => renderTaskCard(lid, ws))}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <StickyActionBar>
        <Button className="w-full shadow-lg h-12 text-base" onClick={closingDay} disabled={workers.length === 0 || closing}>
          {closing ? "Closing…" : <>Close Day {pendingCount > 0 ? `· ${pendingCount} pending` : `(${groups.length} task)`}</>}
        </Button>
      </StickyActionBar>
    </div>
  );
}
