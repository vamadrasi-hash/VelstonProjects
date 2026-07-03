import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { StatusPill, type StatusKind } from "@/components/StatusPill";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { ColorLegend } from "@/components/ColorLegend";
import { buildDayStateMap, dayStateClasses, dayStateLabel } from "@/lib/dayState";
import { fmtINR } from "@/lib/format";

type Roster = { supervisor_id: string; worker_id: string; work_date: string; released_at: string | null; release_reason: string | null };
type Log = {
  id: string; date: string; line_item_id: string | null;
  supervisor_id: string | null; worker_id: string | null;
  total_wages: number; wage_scale: number; hours: number;
  contractor_share: number; work_done: number; remark: string;
};
type Worker = { id: string; name: string; designation: string; daily_rate: number; contractor_id: string | null;
  is_busy: boolean; current_supervisor_id: string | null; current_line_item_id: string | null };
type LI = { id: string; description: string; po_id: string; quantity: number; uom: string; area_id: string | null };
type Photo = { id: string; supervisor_id: string; line_item_id: string | null; kind: "before" | "after"; work_date: string; storage_path: string; latitude: number | null; longitude: number | null; accuracy_m: number | null; captured_at: string | null };

const today = () => new Date().toISOString().slice(0, 10);

export default function Dashboard() {
  const [date] = useState(today());
  const [roster, setRoster] = useState<Roster[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [workers, setWorkers] = useState<Record<string, Worker>>({});
  const [items, setItems] = useState<Record<string, LI>>({});
  const [areas, setAreas] = useState<Record<string, string>>({});
  const [sups, setSups] = useState<Record<string, string>>({});
  const [contractors, setContractors] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<{ url: string; caption: string } | null>(null);
  const [activeSites, setActiveSites] = useState<Array<{ areaId: string; areaName: string; primaryId: string | null; primaryName: string; assistNames: string[]; workerCount: number }>>([]);
  const [needsAssignment, setNeedsAssignment] = useState<Array<{ poId: string; poNumber: string | null; client: string; workOrder: string; total: number; assigned: number; pct: number; done: number; donePct: number }>>([]);

  useEffect(() => {
    (async () => {
      const [{ data: ros }, { data: dl }, { data: ws }, { data: li }, { data: ar }, { data: ss }, { data: ct }, { data: ph }] = await Promise.all([
        supabase.from("sup_daily_roster").select("supervisor_id,worker_id,work_date,released_at,release_reason").eq("work_date", date),
        supabase.from("daily_logs").select("id,date,line_item_id,supervisor_id,worker_id,total_wages,wage_scale,hours,contractor_share,work_done,remark").eq("date", date),
        supabase.from("workers").select("*"),
        supabase.from("po_line_items").select("id,description,po_id,quantity,uom,area_id"),
        supabase.from("areas").select("id,name"),
        supabase.from("supervisors").select("id,name"),
        supabase.from("contractors").select("id,name"),
        supabase.from("work_photos").select("*").eq("work_date", date),
      ]);
      setRoster((ros as any) || []);
      setLogs(((dl as any) || []).map((x: any) => ({
        ...x, total_wages: Number(x.total_wages), wage_scale: Number(x.wage_scale), hours: Number(x.hours),
        contractor_share: Number(x.contractor_share || 0), work_done: Number(x.work_done || 0),
      })));
      const wm: Record<string, Worker> = {};
      ((ws as any) || []).forEach((w: any) => (wm[w.id] = { ...w, daily_rate: Number(w.daily_rate) || 0 }));
      setWorkers(wm);
      const im: Record<string, LI> = {};
      ((li as any) || []).forEach((i: any) => (im[i.id] = { ...i, quantity: Number(i.quantity) }));
      setItems(im);
      const am: Record<string, string> = {};
      ((ar as any) || []).forEach((a: any) => (am[a.id] = a.name));
      setAreas(am);
      const sm: Record<string, string> = {};
      ((ss as any) || []).forEach((s: any) => (sm[s.id] = s.name));
      setSups(sm);
      const cm: Record<string, string> = {};
      ((ct as any) || []).forEach((c: any) => (cm[c.id] = c.name));
      setContractors(cm);
      const phs = ((ph as any) || []) as Photo[];
      setPhotos(phs);
      const paths = phs.map((p) => p.storage_path);
      const urls: Record<string, string> = {};
      for (let i = 0; i < paths.length; i += 100) {
        const batch = paths.slice(i, i + 100);
        const { data: signed } = await supabase.storage.from("work-photos").createSignedUrls(batch, 60 * 60);
        (signed || []).forEach((s: any, idx: number) => { if (s.signedUrl) urls[batch[idx]] = s.signedUrl; });
      }
      setThumbs(urls);

      // Load active sites (with any supervisor seat)
      const [{ data: sa }, { data: lia }] = await Promise.all([
        supabase.from("site_assignments").select("id,area_id,primary_supervisor_id"),
        supabase.from("line_item_assignments").select("site_assignment_id,supervisor_id").is("line_item_id", null),
      ]);
      const supNames: Record<string, string> = {};
      ((ss as any) || []).forEach((s: any) => (supNames[s.id] = s.name));
      const areaNamesLocal: Record<string, string> = {};
      ((ar as any) || []).forEach((a: any) => (areaNamesLocal[a.id] = a.name));
      const workersArr = (ws as any) || [];
      const seatsBySA: Record<string, string[]> = {};
      ((lia as any) || []).forEach((r: any) => {
        if (!r.site_assignment_id || !r.supervisor_id) return;
        (seatsBySA[r.site_assignment_id] ||= []).push(r.supervisor_id);
      });
      const rowsBuilt: typeof activeSites = [];
      ((sa as any) || []).forEach((row: any) => {
        if (!row.area_id) return;
        const seatIds = Array.from(new Set(seatsBySA[row.id] || []));
        if (seatIds.length === 0 && !row.primary_supervisor_id) return;
        const primaryId = row.primary_supervisor_id || null;
        const assistIds = seatIds.filter((i) => i !== primaryId);
        const wc = workersArr.filter((w: any) => w.is_busy && w.current_area_id === row.area_id).length;
        rowsBuilt.push({
          areaId: row.area_id,
          areaName: areaNamesLocal[row.area_id] || "—",
          primaryId,
          primaryName: primaryId ? (supNames[primaryId] || "—") : "Unassigned",
          assistNames: assistIds.map((i) => supNames[i] || "—"),
          workerCount: wc,
        });
      });
      // Merge duplicate area rows (an area may have multiple SAs across POs)
      const merged = new Map<string, typeof rowsBuilt[number]>();
      rowsBuilt.forEach((r) => {
        const ex = merged.get(r.areaId);
        if (!ex) merged.set(r.areaId, { ...r });
        else {
          if (!ex.primaryId && r.primaryId) { ex.primaryId = r.primaryId; ex.primaryName = r.primaryName; }
          ex.assistNames = Array.from(new Set([...ex.assistNames, ...r.assistNames]));
          ex.workerCount = Math.max(ex.workerCount, r.workerCount);
        }
      });
      setActiveSites(Array.from(merged.values()).sort((a, b) => a.areaName.localeCompare(b.areaName)));

      // Needs-assignment widget: POs with unassigned line qty
      const [{ data: allPos }, { data: allLi }, { data: allSa }, { data: allLogs }] = await Promise.all([
        supabase.from("purchase_orders").select("id,po_number,client_name,site,doc_date").order("doc_date", { ascending: false }),
        supabase.from("po_line_items").select("id,po_id,quantity"),
        supabase.from("site_assignments").select("id,po_id"),
        supabase.from("daily_logs").select("line_item_id,work_done"),
      ]);
      const saByPo = new Map<string, string>();
      ((allSa as any) || []).forEach((s: any) => saByPo.set(s.id, s.po_id));
      const saIds2 = ((allSa as any) || []).map((s: any) => s.id);
      const { data: sai2 } = saIds2.length
        ? await supabase.from("site_assignment_items").select("site_assignment_id,po_line_item_id,quantity").in("site_assignment_id", saIds2)
        : { data: [] as any[] };
      const lineQtyMap = new Map<string, number>();
      const linePo = new Map<string, string>();
      ((allLi as any) || []).forEach((r: any) => {
        lineQtyMap.set(r.id, Number(r.quantity) || 0);
        linePo.set(r.id, r.po_id);
      });
      const totalPo: Record<string, number> = {};
      ((allLi as any) || []).forEach((r: any) => {
        totalPo[r.po_id] = (totalPo[r.po_id] || 0) + (Number(r.quantity) || 0);
      });
      const perLine2: Record<string, number> = {};
      ((sai2 as any) || []).forEach((r: any) => {
        perLine2[r.po_line_item_id] = (perLine2[r.po_line_item_id] || 0) + (Number(r.quantity) || 0);
      });
      const assignedPo: Record<string, number> = {};
      Object.entries(perLine2).forEach(([lid, q]) => {
        const cap = lineQtyMap.get(lid) || 0;
        const pid = linePo.get(lid);
        if (!pid) return;
        assignedPo[pid] = (assignedPo[pid] || 0) + Math.min(q, cap);
      });
      // Work done rollup per PO
      const donePo: Record<string, number> = {};
      ((allLogs as any) || []).forEach((r: any) => {
        if (!r.line_item_id) return;
        const pid = linePo.get(r.line_item_id);
        if (!pid) return;
        const cap = lineQtyMap.get(r.line_item_id) || 0;
        // cap per-line contribution so overshoots don't skew total
        const cur = (donePo[pid] || 0);
        donePo[pid] = cur + Math.min(Number(r.work_done) || 0, cap);
      });
      const pending: any[] = [];
      ((allPos as any) || []).forEach((po: any) => {
        const t = totalPo[po.id] || 0;
        const a = assignedPo[po.id] || 0;
        if (t > 0 && a < t - 0.0001) {
          const d = Math.min(donePo[po.id] || 0, t);
          pending.push({
            poId: po.id, poNumber: po.po_number, client: po.client_name, workOrder: po.site,
            total: t, assigned: a, pct: Math.round((a / t) * 100),
            done: d, donePct: Math.round((d / t) * 100),
          });
        }
      });
      setNeedsAssignment(pending);
    })();
  }, [date]);

  // Index logs by (sup|worker)
  const logBy = useMemo(() => {
    const m = new Map<string, Log>();
    logs.forEach((l) => m.set(`${l.supervisor_id || ""}|${l.worker_id || ""}`, l));
    return m;
  }, [logs]);

  const photoFor = (sid: string, lid: string | null, kind: "before" | "after") =>
    photos.find((p) => p.supervisor_id === sid && p.kind === kind && (lid ? p.line_item_id === lid : !p.line_item_id));

  type WorkerRow = {
    worker: Worker; status: StatusKind; lineItemId: string | null;
    workDone: number; uom: string; days: number; hours: number; rupees: number;
  };
  type TaskRow = { lineItemId: string | null; description: string; uom: string; workers: WorkerRow[] };
  type SiteRow = { siteId: string | null; siteName: string; tasks: Map<string, TaskRow> };
  type SupRow = { supId: string; supName: string; sites: Map<string, SiteRow>; nWorkers: number; nTasks: number; rupees: number };

  const dayStateMap = useMemo(() => buildDayStateMap(roster), [roster]);

  const grouped = useMemo<SupRow[]>(() => {
    const supMap = new Map<string, SupRow>();
    const getSup = (sid: string): SupRow => {
      let r = supMap.get(sid);
      if (!r) { r = { supId: sid, supName: sups[sid] || "—", sites: new Map(), nWorkers: 0, nTasks: 0, rupees: 0 }; supMap.set(sid, r); }
      return r;
    };
    const getSite = (sup: SupRow, sId: string | null): SiteRow => {
      const k = sId || "__none";
      let s = sup.sites.get(k);
      if (!s) { s = { siteId: sId, siteName: sId ? (areas[sId] || "—") : "Unassigned", tasks: new Map() }; sup.sites.set(k, s); }
      return s;
    };
    const getTask = (site: SiteRow, lid: string | null, desc: string, uom: string): TaskRow => {
      const k = lid || "__none";
      let t = site.tasks.get(k);
      if (!t) { t = { lineItemId: lid, description: desc, uom, workers: [] }; site.tasks.set(k, t); }
      return t;
    };

    roster.forEach((r) => {
      const w = workers[r.worker_id]; if (!w) return;
      const log = logBy.get(`${r.supervisor_id}|${r.worker_id}`);
      const lid = log?.line_item_id || (w.is_busy && w.current_supervisor_id === r.supervisor_id ? w.current_line_item_id : null);
      const it = lid ? items[lid] : null;
      const siteId = it?.area_id || null;
      const days = log ? Number(log.wage_scale) : 0;
      const hours = log ? Number(log.hours) : 0;
      const total = (days + hours / 8) * Number(w.daily_rate || 0);
      let status: StatusKind = "selected";
      if (r.released_at && r.release_reason === "no_task") status = "notask";
      else if (log && total > 0) status = "done";
      else if (w.is_busy && w.current_supervisor_id === r.supervisor_id) status = "working";
      else if (lid) status = "assigned";

      const sup = getSup(r.supervisor_id);
      const site = getSite(sup, siteId);
      const task = getTask(site, lid, it?.description || (status === "notask" ? "No task" : "Selected only"), it?.uom || "");
      task.workers.push({
        worker: w, status, lineItemId: lid,
        workDone: Number(log?.work_done || 0), uom: it?.uom || "",
        days, hours, rupees: total,
      });
      sup.nWorkers += 1;
      sup.rupees += total;
    });

    // count distinct tasks per sup
    supMap.forEach((sup) => {
      let n = 0;
      sup.sites.forEach((s) => s.tasks.forEach((t) => { if (t.lineItemId) n += 1; }));
      sup.nTasks = n;
    });

    return Array.from(supMap.values()).sort((a, b) => a.supName.localeCompare(b.supName));
  }, [roster, logBy, workers, items, areas, sups]);

  const kpis = useMemo(() => {
    let ended = 0, inProg = 0;
    grouped.forEach((g) => {
      const s = dayStateMap.get(`${g.supId}|${date}`);
      if (s === "ended") ended += 1; else inProg += 1;
    });
    return { ended, inProg, total: grouped.length };
  }, [grouped, dayStateMap, date]);

  const [lightboxGps, setLightboxGps] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const openPhoto = (sid: string, lid: string | null, kind: "before" | "after") => {
    const p = photoFor(sid, lid, kind);
    if (!p) return;
    const url = thumbs[p.storage_path]; if (!url) return;
    const gps = (p.latitude != null && p.longitude != null) ? ` · ${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)} (±${(p.accuracy_m || 0).toFixed(0)}m)` : "";
    setLightbox({ url, caption: `${kind === "before" ? "BEFORE" : "AFTER"} · ${date}${gps}` });
    setLightboxGps({ lat: p.latitude, lng: p.longitude });
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Today's Status</h2>
          <div className="text-xs text-muted-foreground">{date} · grouped by supervisor</div>
        </div>
        <div className="flex items-center gap-3">
          <ColorLegend />
          <a href="/admin/reports" className="inline-flex items-center gap-1 h-9 px-3 rounded-md border bg-primary text-primary-foreground text-sm hover:opacity-90">
            📊 Daily Reports
          </a>
        </div>
      </div>

      {grouped.length > 0 && (
        <Card className="p-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-md p-2 bg-status-working/10 ring-1 ring-status-working/30">
            <div className="font-semibold text-status-working text-lg leading-none">{kpis.inProg}</div>
            <div className="text-muted-foreground mt-1">In Progress</div>
          </div>
          <div className="rounded-md p-2 bg-status-ended/10 ring-1 ring-status-ended/30">
            <div className="font-semibold text-status-ended text-lg leading-none">{kpis.ended}</div>
            <div className="text-muted-foreground mt-1">Day Ended</div>
          </div>
          <div className="rounded-md p-2 bg-muted/40 ring-1 ring-border">
            <div className="font-semibold text-lg leading-none">{kpis.total}</div>
            <div className="text-muted-foreground mt-1">Total Supervisors</div>
          </div>
        </Card>
      )}

      {/* Needs Assignment */}
      {needsAssignment.length > 0 && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="font-semibold text-sm">Needs Assignment</div>
              <div className="text-xs text-muted-foreground">{needsAssignment.length} PO(s) with unassigned quantity</div>
            </div>
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {needsAssignment.slice(0, 8).map((n) => (
              <a key={n.poId} href={`/admin/purchase-orders/${n.poId}/sites`}
                className="block p-2 rounded border hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">
                      <span className="text-primary font-medium">{n.poNumber || "(no #)"}</span> · {n.client}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">📍 {n.workOrder}</div>
                  </div>
                </div>
                <div className="mt-1.5 grid grid-cols-[70px_1fr_auto] items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Assigned</span>
                  <div className="h-1.5 rounded bg-muted overflow-hidden">
                    <div className={`h-full ${n.pct > 0 ? "bg-amber-500" : "bg-muted-foreground/30"}`} style={{ width: `${n.pct}%` }} />
                  </div>
                  <span className="text-[11px] whitespace-nowrap tabular-nums">{n.assigned}/{n.total} ({n.pct}%)</span>

                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Done</span>
                  <div className="h-1.5 rounded bg-muted overflow-hidden">
                    <div className={`h-full ${n.donePct > 0 ? "bg-emerald-500" : "bg-muted-foreground/30"}`} style={{ width: `${n.donePct}%` }} />
                  </div>
                  <span className="text-[11px] whitespace-nowrap tabular-nums">{n.done}/{n.total} ({n.donePct}%)</span>
                </div>
              </a>
            ))}
            {needsAssignment.length > 8 && (
              <div className="text-[11px] text-muted-foreground text-center pt-1">
                + {needsAssignment.length - 8} more
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ACTIVE SITES — persistent overview grouped by primary supervisor */}
      {activeSites.length > 0 && (() => {
        const bySup = new Map<string, typeof activeSites>();
        activeSites.forEach((s) => {
          const k = s.primaryId || "__none";
          bySup.set(k, [...(bySup.get(k) || []), s] as any);
        });
        const groups = Array.from(bySup.entries()).sort((a, b) => {
          const an = a[1][0].primaryName, bn = b[1][0].primaryName;
          return an.localeCompare(bn);
        });
        return (
          <Card className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm">Active Sites</div>
                <div className="text-[11px] text-muted-foreground">Sites with an assigned supervisor · grouped by primary</div>
              </div>
              <Badge variant="secondary">{activeSites.length} site(s)</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {groups.map(([supId, sites]) => (
                <div key={supId} className="border rounded-md p-2 space-y-1">
                  <div className="text-xs font-semibold flex items-center gap-2">
                    <span>👤 {sites[0].primaryName}</span>
                    <Badge variant="outline" className="text-[10px]">{sites.length} site(s)</Badge>
                  </div>
                  <div className="space-y-1">
                    {sites.map((s) => (
                      <div key={s.areaId} className="flex items-center gap-2 flex-wrap text-xs border-l-2 border-role-primary/50 pl-2 py-0.5">
                        <span className="font-medium truncate">📍 {s.areaName}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 ${s.workerCount > 0 ? "bg-status-working hover:bg-status-working text-white" : "bg-muted text-muted-foreground hover:bg-muted"}`}>
                          {s.workerCount} worker{s.workerCount === 1 ? "" : "s"}
                        </Badge>
                        {s.assistNames.length > 0 && (
                          <span className="text-[10px] text-muted-foreground truncate">
                            +Assist: {s.assistNames.join(", ")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      {grouped.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground text-sm">No supervisors active today.</Card>
      )}

      <Accordion type="multiple" defaultValue={grouped.map((g) => g.supId)} className="space-y-2">
        {grouped.map((sup) => {
          const ds = dayStateMap.get(`${sup.supId}|${date}`) || "in_progress";
          const dsc = dayStateClasses(ds);
          return (
          <AccordionItem key={sup.supId} value={sup.supId} className={`border rounded-md bg-card ${dsc.left} ${dsc.bg}`}>
            <AccordionTrigger className="px-3 py-2 hover:no-underline">
              <div className="flex flex-wrap items-center gap-2 w-full pr-2">
                <span className="font-semibold text-sm">👤 {sup.supName}</span>
                <StatusPill status={dsc.badge}>{dayStateLabel(ds)}</StatusPill>
                <Badge variant="secondary" className="text-[10px]">{sup.nWorkers} workers</Badge>
                <Badge variant="secondary" className="text-[10px]">{sup.nTasks} tasks</Badge>
                <span className="ml-auto text-xs font-medium">₹{fmtINR(sup.rupees)}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3 space-y-3">
              {(() => {
                const unassigned = sup.sites.get("__none");
                const assignedSites = Array.from(sup.sites.values()).filter((s) => s.siteId !== null);
                return (
                  <>
                    {unassigned && (
                      <div className="border-l-2 border-muted pl-3 space-y-2">
                        <div className="text-sm font-medium text-muted-foreground">Unassigned</div>
                        {(() => {
                          const allW: WorkerRow[] = [];
                          unassigned.tasks.forEach((t) => allW.push(...t.workers));
                          const byC = new Map<string, WorkerRow[]>();
                          allW.forEach((w) => {
                            const k = w.worker.contractor_id ? (contractors[w.worker.contractor_id] || "—") : "—";
                            byC.set(k, [...(byC.get(k) || []), w]);
                          });
                          return Array.from(byC.entries()).sort().map(([cn, list]) => (
                            <div key={cn} className="space-y-1">
                              <div className="text-[10px] uppercase tracking-wide text-primary">{cn}</div>
                              {list.sort((a, b) => a.worker.name.localeCompare(b.worker.name)).map((w) => (
                                <div key={w.worker.id} className="flex flex-wrap items-center gap-2 text-xs pl-2">
                                  <StatusPill status={w.status} />
                                  <span className="font-medium">{w.worker.name}</span>
                                  {w.worker.designation && <span className="text-muted-foreground">· {w.worker.designation}</span>}
                                </div>
                              ))}
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                    {assignedSites.sort((a, b) => a.siteName.localeCompare(b.siteName)).map((site) => (
                      <div key={site.siteId} className="border-l-2 border-primary/40 pl-3 space-y-2">
                        <div className="text-sm font-medium">📍 {site.siteName}</div>
                        {Array.from(site.tasks.values()).map((task) => {
                          const before = task.lineItemId ? photoFor(sup.supId, task.lineItemId, "before") : null;
                          const after = task.lineItemId ? photoFor(sup.supId, task.lineItemId, "after") : null;
                          const byC = new Map<string, WorkerRow[]>();
                          task.workers.forEach((w) => {
                            const k = w.worker.contractor_id ? (contractors[w.worker.contractor_id] || "—") : "—";
                            byC.set(k, [...(byC.get(k) || []), w]);
                          });
                          return (
                            <div key={(task.lineItemId || "none") + task.description} className="border rounded p-2 bg-background space-y-2">
                              <div className="text-xs font-medium leading-snug break-words">🛠 {task.description}</div>
                              {Array.from(byC.entries()).sort().map(([cn, list]) => (
                                <div key={cn} className="space-y-1">
                                  <div className="text-[10px] uppercase tracking-wide text-primary">{cn}</div>
                                  {list.sort((a, b) => a.worker.name.localeCompare(b.worker.name)).map((w) => (
                                    <div key={w.worker.id} className="flex flex-wrap items-center gap-2 text-xs pl-2">
                                      <StatusPill status={w.status} />
                                      <span className="font-medium">{w.worker.name}</span>
                                      {w.worker.designation && <span className="text-muted-foreground">· {w.worker.designation}</span>}
                                      {(w.days > 0 || w.hours > 0) && (
                                        <span className="text-muted-foreground">· {w.days.toFixed(2)}d {w.hours.toFixed(1)}h</span>
                                      )}
                                      {w.workDone > 0 && w.uom && (
                                        <span className="text-muted-foreground">· {w.workDone.toFixed(1)} {w.uom}</span>
                                      )}
                                      {w.rupees > 0 && <span className="font-medium">· ₹{fmtINR(w.rupees)}</span>}
                                    </div>
                                  ))}
                                </div>
                              ))}
                              {(before || after) && (
                                <div className="flex gap-2 pt-1">
                                  {before && thumbs[before.storage_path] && (
                                    <button type="button" onClick={() => openPhoto(sup.supId, task.lineItemId, "before")} className="relative">
                                      <img src={thumbs[before.storage_path]} alt="" className="h-16 w-16 object-cover rounded border" />
                                      <span className="absolute top-0.5 left-0.5 text-[9px] px-1 rounded bg-amber-500 text-white">B</span>
                                    </button>
                                  )}
                                  {after && thumbs[after.storage_path] && (
                                    <button type="button" onClick={() => openPhoto(sup.supId, task.lineItemId, "after")} className="relative">
                                      <img src={thumbs[after.storage_path]} alt="" className="h-16 w-16 object-cover rounded border" />
                                      <span className="absolute top-0.5 left-0.5 text-[9px] px-1 rounded bg-emerald-600 text-white">A</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </>
                );
              })()}
            </AccordionContent>
          </AccordionItem>
          );
        })}
      </Accordion>

      <PhotoLightbox
        open={!!lightbox}
        onClose={() => setLightbox(null)}
        src={lightbox?.url || null}
        caption={lightbox?.caption}
        lat={lightboxGps.lat}
        lng={lightboxGps.lng}
      />
    </div>
  );
}
