import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { daysAgoLabel } from "@/lib/dates";
import { AssignmentBadge } from "@/components/AssignmentBadge";
import { expandSeats } from "./_expand";

type Assign = { id: string; line_item_id: string; assigned_date: string; quantity: number; assignment_no: string | null; parent_assignment_no: string | null; area_id: string | null; site_assignment_id: string | null };
type LI = { id: string; description: string; po_id: string };
type PO = { id: string; site: string; client_name: string };
type Log = {
  id: string; date: string; line_item_id: string | null;
  worker_id: string | null; total_wages: number; wage_scale: number; hours: number;
  contractor_share: number;
};
type Worker = { id: string; name: string; designation: string; daily_rate: number; contractor_id: string | null };

const totalHours = (l: { wage_scale: number; hours: number }) => Number(l.wage_scale) * 8 + Number(l.hours);

export default function Status() {
  const { supervisorId } = useRole();
  const [assigns, setAssigns] = useState<Assign[]>([]);
  const [items, setItems] = useState<Record<string, LI>>({});
  const [pos, setPos] = useState<Record<string, PO>>({});
  const [logs, setLogs] = useState<Log[]>([]);
  const [workers, setWorkers] = useState<Record<string, Worker>>({});
  const [contractors, setContractors] = useState<Record<string, string>>({});
  const [areas, setAreas] = useState<Record<string, string>>({});
  const [siteNames, setSiteNames] = useState<Record<string, string>>({});
  const [saSite, setSaSite] = useState<Record<string, string>>({});
  const [siteFilter, setSiteFilter] = useState<string>("all");

  useEffect(() => {
    if (!supervisorId) return;
    (async () => {
      const [{ data: a }, { data: l }, { data: p }, { data: dl }, { data: ws }, { data: cs }, { data: ars }, { data: stm }, { data: sas }] = await Promise.all([
        supabase.from("line_item_assignments").select("id,line_item_id,assigned_date,quantity,assignment_no,parent_assignment_no,area_id,site_assignment_id")
          .eq("supervisor_id", supervisorId).is("released_at", null),
        supabase.from("po_line_items").select("id,description,po_id"),
        supabase.from("purchase_orders").select("id,site,client_name"),
        supabase.from("daily_logs").select("id,date,line_item_id,worker_id,total_wages,wage_scale,hours,contractor_share")
          .eq("supervisor_id", supervisorId),
        supabase.from("workers").select("id,name,designation,daily_rate,contractor_id"),
        supabase.from("contractors").select("id,name"),
        supabase.from("areas").select("id,name"),
        supabase.from("sites").select("id,name"),
        supabase.from("site_assignments").select("id,site_id,area_id"),
      ]);
      const expanded = await expandSeats(((a as any) || []) as any);
      setAssigns(expanded as any);
      const im: Record<string, LI> = {}; ((l as any) || []).forEach((x: any) => (im[x.id] = x)); setItems(im);
      const pm: Record<string, PO> = {}; ((p as any) || []).forEach((x: any) => (pm[x.id] = x)); setPos(pm);
      setLogs(((dl as any) || []).map((x: any) => ({
        ...x, total_wages: Number(x.total_wages), wage_scale: Number(x.wage_scale), hours: Number(x.hours),
        contractor_share: Number(x.contractor_share || 0),
      })));
      const wm: Record<string, Worker> = {};
      ((ws as any) || []).forEach((w: any) => (wm[w.id] = { ...w, daily_rate: Number(w.daily_rate) || 0 }));
      setWorkers(wm);
      const cm: Record<string, string> = {};
      ((cs as any) || []).forEach((c: any) => (cm[c.id] = c.name));
      setContractors(cm);
      const am: Record<string, string> = {};
      ((ars as any) || []).forEach((ar: any) => (am[ar.id] = ar.name));
      setAreas(am);
      const sn: Record<string, string> = { ...am };
      ((stm as any) || []).forEach((s: any) => { if (!sn[s.id]) sn[s.id] = s.name; });
      setSiteNames(sn);
      const sa: Record<string, string> = {};
      ((sas as any) || []).forEach((s: any) => (sa[s.id] = s.area_id || s.site_id || ""));
      setSaSite(sa);
    })();
  }, [supervisorId]);

  const cards = useMemo(() => {
    return assigns.map((a) => {
      const li = items[a.line_item_id];
      const po = li ? pos[li.po_id] : undefined;
      const myLogs = logs.filter((x) => x.line_item_id === a.line_item_id);
      let wages = 0, hours = 0, rupees = 0, contractorRs = 0, firstDate = "", lastDate = "";
      const byWorker: Record<string, { wages: number; hours: number; rupees: number; contractorRs: number }> = {};
      for (const l of myLogs) {
        wages += l.total_wages; hours += totalHours(l);
        const rate = workers[l.worker_id || ""]?.daily_rate || 0;
        const r = l.total_wages * rate;
        const cs = Math.min(Number(l.contractor_share || 0), r);
        rupees += r;
        contractorRs += cs;
        if (!firstDate || l.date < firstDate) firstDate = l.date;
        if (l.date > lastDate) lastDate = l.date;
        const wid = l.worker_id || "—";
        const b = (byWorker[wid] ??= { wages: 0, hours: 0, rupees: 0, contractorRs: 0 });
        b.wages += l.total_wages; b.hours += totalHours(l); b.rupees += r; b.contractorRs += cs;
      }
      const sid = (a.site_assignment_id && saSite[a.site_assignment_id]) || null;
      const siteKey = sid || "__none";
      const siteName = sid ? (siteNames[sid] || "—") : "Unassigned site";
      return { a, li, po, siteKey, siteName, areaName: a.area_id ? (areas[a.area_id] || null) : null, wages, hours, rupees, contractorRs, workerRs: rupees - contractorRs, firstDate, lastDate, byWorker };
    }).sort((a, b) => (b.lastDate || b.a.assigned_date).localeCompare(a.lastDate || a.a.assigned_date));
  }, [assigns, items, pos, logs, workers, areas, siteNames, saSite]);

  const siteOptions = useMemo(() => {
    const m = new Map<string, string>();
    cards.forEach((c) => m.set(c.siteKey, c.siteName));
    return Array.from(m.entries()).sort(([, a], [, b]) => a.localeCompare(b));
  }, [cards]);

  const groupedBySite = useMemo(() => {
    const filtered = siteFilter === "all" ? cards : cards.filter((c) => c.siteKey === siteFilter);
    const m = new Map<string, typeof cards>();
    filtered.forEach((c) => {
      const list = m.get(c.siteKey) || [];
      list.push(c);
      m.set(c.siteKey, list);
    });
    return Array.from(m.entries())
      .map(([k, list]) => ({ key: k, name: list[0].siteName, list }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cards, siteFilter]);

  if (!supervisorId) {
    return <Card className="p-6 text-center text-muted-foreground text-sm">Pick a supervisor first.</Card>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">My Task Status</h2>
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
      {groupedBySite.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">No assignments.</Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {groupedBySite.map((g) => {
            const totalRs = g.list.reduce((s, c) => s + c.rupees, 0);
            return (
              <AccordionItem key={g.key} value={g.key} className="border rounded-md bg-card">
                <AccordionTrigger className="px-3 py-2 hover:no-underline">
                  <div className="flex items-center justify-between w-full gap-2 pr-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="default" className="text-sm shrink-0">📍 {g.name}</Badge>
                      <span className="text-xs text-muted-foreground">{g.list.length} task(s)</span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">₹{totalRs.toFixed(0)}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-2">
                  <Accordion type="multiple" className="space-y-2">
                    {g.list.map((c) => (
                      <AccordionItem key={c.a.id} value={c.a.id} className="border rounded-md bg-background">
                        <AccordionTrigger className="px-3 py-2 hover:no-underline [&>svg]:shrink-0">
                          <div className="flex flex-col w-full min-w-0 gap-1 pr-2 text-left">
                            <div className="flex items-center gap-2 flex-wrap">
                              <AssignmentBadge no={c.a.assignment_no} size="md" />
                              {c.a.parent_assignment_no && (
                                <span className="text-[10px] text-muted-foreground">of {c.a.parent_assignment_no}</span>
                              )}
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap ml-auto shrink-0">
                                {c.rupees > 0 ? `₹${c.rupees.toFixed(0)}` : "no logs"}
                              </span>
                            </div>
                            <div className="font-semibold break-words min-w-0">{c.li?.description || "—"}</div>
                            <div className="text-[11px] text-muted-foreground break-words">
                              {c.po ? `${c.po.site} — ${c.po.client_name}` : "—"}
                              {c.areaName && <span className="ml-1">· 📍 {c.areaName}</span>}
                            </div>
                            <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                              <span>Assigned {c.a.assigned_date} ({daysAgoLabel(c.a.assigned_date)})</span>
                              {c.firstDate && <span>· Started {daysAgoLabel(c.firstDate)}</span>}
                              {c.lastDate && <span>· Last {daysAgoLabel(c.lastDate)}</span>}
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-3 pb-3 space-y-2">
                          <div className="text-xs flex flex-wrap gap-x-3">
                            <span>Wages: <b>{c.wages.toFixed(2)}w</b></span>
                            <span>Hours: <b>{c.hours.toFixed(1)}h</b></span>
                            {c.contractorRs > 0 && (
                              <>
                                <span>Workers ₹: <b>{c.workerRs.toFixed(0)}</b></span>
                                <span>Contractors ₹: <b>{c.contractorRs.toFixed(0)}</b></span>
                              </>
                            )}
                            <span>Total: <b>₹{c.rupees.toFixed(0)}</b></span>
                          </div>
                          <div className="space-y-1">
                            {Object.entries(c.byWorker).length === 0 && (
                              <div className="text-xs text-muted-foreground">No workers logged yet.</div>
                            )}
                            {Object.entries(c.byWorker).map(([wid, b]) => {
                              const w = workers[wid];
                              const contractorName = contractors[w?.contractor_id || ""] || "Contractor";
                              return (
                                <Card key={wid} className="p-2 text-xs flex justify-between gap-2 flex-wrap">
                                  <div className="font-medium">
                                    {w?.name || "—"} <span className="text-muted-foreground">({w?.designation || "—"})</span>
                                  </div>
                                  <div className="text-muted-foreground">
                                    {b.contractorRs > 0
                                      ? <>{b.hours.toFixed(1)}h · {w?.name || "Worker"}: ₹{(b.rupees - b.contractorRs).toFixed(0)} · {contractorName}: ₹{b.contractorRs.toFixed(0)}</>
                                      : <>{b.wages.toFixed(2)}w · {b.hours.toFixed(1)}h · ₹{b.rupees.toFixed(0)}</>}
                                  </div>
                                </Card>
                              );
                            })}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
