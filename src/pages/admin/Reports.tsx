import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Download, FileText, Loader2 } from "lucide-react";
import { todayIso, fmtINR } from "@/lib/format";
import { buildSummaryPdf, buildFullPdf, ReportRow, PhotoRef } from "@/lib/reportPdf";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { StatusPill } from "@/components/StatusPill";
import { ColorLegend } from "@/components/ColorLegend";
import { buildDayStateMap, dayStateClasses, dayStateLabel, type DayState } from "@/lib/dayState";
import { toast } from "sonner";

type RosterRow = { id: string; supervisor_id: string; worker_id: string; work_date: string; released_at: string | null; release_reason: string | null };
type Worker = { id: string; name: string; designation: string; contractor_id: string | null; daily_rate: number | null };
type DailyLog = { id: string; date: string; supervisor_id: string | null; worker_id: string | null; line_item_id: string | null; wage_scale: number; hours: number; total_wages: number; work_done: number; contractor_share: number; remark: string };
type LI = { id: string; description: string; uom: string; area_id: string | null; po_id: string };
type Photo = { id: string; supervisor_id: string; line_item_id: string | null; site_id: string | null; kind: "before" | "after"; work_date: string; storage_path: string; latitude: number | null; longitude: number | null; accuracy_m: number | null; captured_at: string | null };
type SiteRemark = { id: string; supervisor_id: string; area_id: string; work_date: string; remark: string };

export default function Reports() {
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [taskFilter, setTaskFilter] = useState<string>("all");
  const [supFilter, setSupFilter] = useState<string>("all");

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [workers, setWorkers] = useState<Record<string, Worker>>({});
  const [items, setItems] = useState<Record<string, LI>>({});
  const [areas, setAreas] = useState<Record<string, string>>({});
  const [contractors, setContractors] = useState<Record<string, string>>({});
  const [sups, setSups] = useState<{ id: string; name: string }[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [remarks, setRemarks] = useState<SiteRemark[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busyPdf, setBusyPdf] = useState<"none" | "summary" | "full">("none");
  const [lightbox, setLightbox] = useState<{ url: string; caption: string; lat: number | null; lng: number | null } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: ros }, { data: dl }, { data: ws }, { data: li }, { data: ar }, { data: cs }, { data: ss }, { data: ph }, { data: rm }] = await Promise.all([
        supabase.from("sup_daily_roster").select("*").gte("work_date", from).lte("work_date", to),
        supabase.from("daily_logs").select("*").gte("date", from).lte("date", to),
        supabase.from("workers").select("id,name,designation,contractor_id,daily_rate"),
        supabase.from("po_line_items").select("id,description,uom,area_id,po_id"),
        supabase.from("areas").select("id,name"),
        supabase.from("contractors").select("id,name"),
        supabase.from("supervisors").select("id,name").order("name"),
        supabase.from("work_photos").select("*").gte("work_date", from).lte("work_date", to),
        supabase.from("sup_site_remarks").select("id,supervisor_id,area_id,work_date,remark").gte("work_date", from).lte("work_date", to),
      ]);
      setRoster((ros as any) || []);
      setLogs(((dl as any) || []).map((x: any) => ({ ...x, wage_scale: Number(x.wage_scale), hours: Number(x.hours), total_wages: Number(x.total_wages), work_done: Number(x.work_done || 0), contractor_share: Number(x.contractor_share || 0) })));
      const wm: Record<string, Worker> = {};
      ((ws as any) || []).forEach((w: any) => (wm[w.id] = { ...w, daily_rate: Number(w.daily_rate) || 0 }));
      setWorkers(wm);
      const im: Record<string, LI> = {};
      ((li as any) || []).forEach((i: any) => (im[i.id] = i));
      setItems(im);
      const am: Record<string, string> = {};
      ((ar as any) || []).forEach((a: any) => (am[a.id] = a.name));
      setAreas(am);
      const cm: Record<string, string> = {};
      ((cs as any) || []).forEach((c: any) => (cm[c.id] = c.name));
      setContractors(cm);
      setSups(((ss as any) || []));
      const phs = ((ph as any) || []) as Photo[];
      setPhotos(phs);
      setRemarks((rm as any) || []);
      // Sign photo URLs
      const paths = phs.map((p) => p.storage_path);
      const urls: Record<string, string> = {};
      for (let i = 0; i < paths.length; i += 100) {
        const batch = paths.slice(i, i + 100);
        const { data: signed } = await supabase.storage.from("work-photos").createSignedUrls(batch, 60 * 60);
        (signed || []).forEach((s: any, idx: number) => { if (s.signedUrl) urls[batch[idx]] = s.signedUrl; });
      }
      setPhotoUrls(urls);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to]);

  const supNameById = useMemo(() => {
    const m: Record<string, string> = {};
    sups.forEach((s) => (m[s.id] = s.name));
    return m;
  }, [sups]);

  // ------------------------------------------------------------------
  // Nested grouping:  Date → Supervisor → Site → {workers, tasks, photos, remarks}
  // ------------------------------------------------------------------
  type WorkerCell = {
    worker: Worker;
    days: number; hours: number; rupees: number;
    lineItemId: string | null;
    released: boolean;
  };
  type TaskCell = {
    lineItemId: string;
    description: string;
    uom: string;
    workDone: number;
    beforePhotos: Photo[];
    afterPhotos: Photo[];
  };
  type SiteCell = {
    siteId: string | null;
    siteName: string;
    workersByContractor: Map<string, WorkerCell[]>;
    tasks: Map<string, TaskCell>;
    unassignedPhotos: { before: Photo[]; after: Photo[] }; // photos with no line_item
    remark: string;
    totalRupees: number;
    workerCount: number;
  };
  type SupCell = {
    supId: string; supName: string;
    sites: Map<string, SiteCell>;
    rupees: number; workerCount: number;
  };

  const dayStateMap = useMemo(() => buildDayStateMap(roster), [roster]);

  const grouped = useMemo(() => {
    const byDate = new Map<string, Map<string, SupCell>>();
    const getSup = (date: string, sid: string): SupCell => {
      if (!byDate.has(date)) byDate.set(date, new Map());
      const supMap = byDate.get(date)!;
      let s = supMap.get(sid);
      if (!s) { s = { supId: sid, supName: supNameById[sid] || "—", sites: new Map(), rupees: 0, workerCount: 0 }; supMap.set(sid, s); }
      return s;
    };
    const getSite = (sup: SupCell, sId: string | null): SiteCell => {
      const k = sId || "__none";
      let s = sup.sites.get(k);
      if (!s) { s = { siteId: sId, siteName: sId ? (areas[sId] || "—") : "Unassigned", workersByContractor: new Map(), tasks: new Map(), unassignedPhotos: { before: [], after: [] }, remark: "", totalRupees: 0, workerCount: 0 }; sup.sites.set(k, s); }
      return s;
    };

    const logKey = (sid: string | null, wid: string | null, d: string) => `${sid || ""}|${wid || ""}|${d}`;
    const logMap = new Map<string, DailyLog>();
    logs.forEach((l) => logMap.set(logKey(l.supervisor_id, l.worker_id, l.date), l));

    // 1. Workers from roster
    roster.forEach((r) => {
      const w = workers[r.worker_id]; if (!w) return;
      const log = logMap.get(logKey(r.supervisor_id, r.worker_id, r.work_date));
      const lid = log?.line_item_id || null;
      const it = lid ? items[lid] : null;
      const siteId = it?.area_id || null;
      const days = log ? Number(log.wage_scale) : 0;
      const hours = log ? Number(log.hours) : 0;
      const rupees = (days + hours / 8) * Number(w.daily_rate || 0);

      const sup = getSup(r.work_date, r.supervisor_id);
      const site = getSite(sup, siteId);
      const cn = w.contractor_id ? (contractors[w.contractor_id] || "—") : "—";
      if (!site.workersByContractor.has(cn)) site.workersByContractor.set(cn, []);
      site.workersByContractor.get(cn)!.push({ worker: w, days, hours, rupees, lineItemId: lid, released: !!r.released_at });
      site.totalRupees += rupees;
      site.workerCount += 1;
      sup.rupees += rupees;
      sup.workerCount += 1;
    });

    // 2. Work-status from daily_logs.work_done (aggregated per line_item)
    logs.forEach((l) => {
      if (!l.supervisor_id || !l.line_item_id) return;
      const it = items[l.line_item_id]; if (!it) return;
      const sup = getSup(l.date, l.supervisor_id);
      const site = getSite(sup, it.area_id);
      let t = site.tasks.get(l.line_item_id);
      if (!t) { t = { lineItemId: l.line_item_id, description: it.description, uom: it.uom, workDone: 0, beforePhotos: [], afterPhotos: [] }; site.tasks.set(l.line_item_id, t); }
      t.workDone += Number(l.work_done || 0);
    });

    // 3. Photos → attach to task; if no line item, keep in unassignedPhotos
    photos.forEach((p) => {
      const sup = getSup(p.work_date, p.supervisor_id);
      const it = p.line_item_id ? items[p.line_item_id] : null;
      const siteId = it?.area_id || p.site_id || null;
      const site = getSite(sup, siteId);
      if (p.line_item_id && it) {
        let t = site.tasks.get(p.line_item_id);
        if (!t) { t = { lineItemId: p.line_item_id, description: it.description, uom: it.uom, workDone: 0, beforePhotos: [], afterPhotos: [] }; site.tasks.set(p.line_item_id, t); }
        (p.kind === "before" ? t.beforePhotos : t.afterPhotos).push(p);
      } else {
        (p.kind === "before" ? site.unassignedPhotos.before : site.unassignedPhotos.after).push(p);
      }
    });

    // 4. Site remarks
    remarks.forEach((r) => {
      const sup = getSup(r.work_date, r.supervisor_id);
      const site = getSite(sup, r.area_id);
      site.remark = r.remark || site.remark;
    });

    return Array.from(byDate.entries())
      .sort((a, b) => b[0].localeCompare(a[0]));
  }, [roster, logs, workers, items, areas, contractors, sups, photos, remarks, supNameById]);

  // Apply filters at the site-level
  const filteredGrouped = useMemo(() => {
    return grouped.map(([date, bySup]) => {
      const newSup = new Map<string, SupCell>();
      bySup.forEach((sup) => {
        if (supFilter !== "all" && sup.supName !== supFilter) return;
        const newSites = new Map<string, SiteCell>();
        sup.sites.forEach((site, k) => {
          if (siteFilter !== "all" && site.siteName !== siteFilter) return;
          if (taskFilter !== "all") {
            let hit = false;
            site.tasks.forEach((t) => { if (t.description === taskFilter) hit = true; });
            if (!hit) return;
          }
          newSites.set(k, site);
        });
        if (newSites.size === 0) return;
        newSup.set(sup.supId, { ...sup, sites: newSites });
      });
      return [date, newSup] as const;
    }).filter(([, m]) => m.size > 0);
  }, [grouped, supFilter, siteFilter, taskFilter]);

  // Filter option lists
  const uniqSites = useMemo(() => {
    const s = new Set<string>();
    grouped.forEach(([, bs]) => bs.forEach((sup) => sup.sites.forEach((site) => { if (site.siteName !== "Unassigned") s.add(site.siteName); })));
    return Array.from(s).sort();
  }, [grouped]);
  const uniqTasks = useMemo(() => {
    const s = new Set<string>();
    grouped.forEach(([, bs]) => bs.forEach((sup) => sup.sites.forEach((site) => {
      if (siteFilter !== "all" && site.siteName !== siteFilter) return;
      site.tasks.forEach((t) => s.add(t.description));
    })));
    return Array.from(s).sort();
  }, [grouped, siteFilter]);
  const uniqSups = useMemo(() => Array.from(new Set(sups.map((s) => s.name))).sort(), [sups]);
  useEffect(() => { setTaskFilter("all"); }, [siteFilter]);

  // KPIs
  const kpis = useMemo(() => {
    let workers = 0, sites = 0, rupees = 0, photoCount = 0;
    filteredGrouped.forEach(([, bs]) => bs.forEach((sup) => {
      workers += sup.workerCount;
      rupees += sup.rupees;
      sup.sites.forEach((site) => {
        if (site.siteName !== "Unassigned") sites += 1;
        site.tasks.forEach((t) => { photoCount += t.beforePhotos.length + t.afterPhotos.length; });
        photoCount += site.unassignedPhotos.before.length + site.unassignedPhotos.after.length;
      });
    }));
    return { workers, sites, rupees, photos: photoCount };
  }, [filteredGrouped]);

  // Flatten rows for PDF (keeps existing PDF format working)
  const pdfRows = useMemo<ReportRow[]>(() => {
    const out: ReportRow[] = [];
    filteredGrouped.forEach(([date, bs]) => bs.forEach((sup) => sup.sites.forEach((site) => {
      site.workersByContractor.forEach((list, cn) => {
        list.forEach((w) => {
          const it = w.lineItemId ? items[w.lineItemId] : null;
          const task = it ? it.description : "—";
          const uom = it?.uom || "";
          const total = w.rupees;
          out.push({
            date, site: site.siteName, contractor: cn,
            worker: w.worker.name, designation: w.worker.designation || "",
            supervisor: sup.supName, task,
            days: w.days, hours: w.hours,
            workDone: 0, uom,
            workerRs: total, contractorRs: 0, totalRs: total,
            photosBefore: 0, photosAfter: 0,
            supervisorId: sup.supId, workerId: w.worker.id,
          } as ReportRow);
        });
      });
    })));
    return out;
  }, [filteredGrouped, items]);

  const openPhoto = (p: Photo, kind: "before" | "after", siteName: string) => {
    const url = photoUrls[p.storage_path]; if (!url) return;
    const gps = (p.latitude != null && p.longitude != null)
      ? ` · ${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)} (±${(p.accuracy_m || 0).toFixed(0)}m)` : "";
    const cap = p.captured_at ? new Date(p.captured_at).toLocaleString() : p.work_date;
    setLightbox({ url, caption: `${kind === "before" ? "BEFORE" : "AFTER"} · ${siteName} · ${cap}${gps}`, lat: p.latitude, lng: p.longitude });
  };

  const handleSummary = () => {
    try {
      setBusyPdf("summary");
      buildSummaryPdf(pdfRows, { from, to, sites: siteFilter === "all" ? [] : [siteFilter], contractors: [], supervisors: supFilter === "all" ? [] : [supFilter] });
    } finally { setBusyPdf("none"); }
  };
  const handleFull = async () => {
    try {
      setBusyPdf("full");
      const refs: PhotoRef[] = [];
      filteredGrouped.forEach(([date, bs]) => bs.forEach((sup) => sup.sites.forEach((site) => {
        site.tasks.forEach((t) => {
          const push = (arr: Photo[], kind: "before" | "after") => arr.forEach((p) => {
            const url = photoUrls[p.storage_path]; if (!url) return;
            refs.push({ date, site: site.siteName, contractor: "—", worker: "", supervisor: sup.supName, task: t.description, kind, url, lat: p.latitude, lng: p.longitude, acc: p.accuracy_m, capturedAt: p.captured_at });
          });
          push(t.beforePhotos, "before"); push(t.afterPhotos, "after");
        });
      })));
      await buildFullPdf(pdfRows, refs, { from, to, sites: siteFilter === "all" ? [] : [siteFilter], contractors: [], supervisors: supFilter === "all" ? [] : [supFilter] });
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally { setBusyPdf("none"); }
  };

  const getDayState = (supId: string, date: string): DayState => dayStateMap.get(`${supId}|${date}`) || "not_started";

  return (
    <div className="space-y-3 md:space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg md:text-xl font-semibold">Daily Reports</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <ColorLegend />
          <Button variant="outline" size="sm" onClick={handleSummary} disabled={busyPdf !== "none" || pdfRows.length === 0}>
            {busyPdf === "summary" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileText className="h-3 w-3 mr-1" />}
            Summary PDF
          </Button>
          <Button size="sm" onClick={handleFull} disabled={busyPdf !== "none" || pdfRows.length === 0}>
            {busyPdf === "full" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
            Full PDF
          </Button>
        </div>
      </div>

      <Card className="p-2 md:p-3 grid grid-cols-2 md:grid-cols-5 gap-2">
        <div>
          <Label className="text-[11px]">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label className="text-[11px]">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label className="text-[11px]">Site</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
            <option value="all">All sites</option>
            {uniqSites.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-[11px]">Task</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)}>
            <option value="all">All tasks</option>
            {uniqTasks.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-[11px]">Supervisor</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={supFilter} onChange={(e) => setSupFilter(e.target.value)}>
            <option value="all">All</option>
            {uniqSups.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </Card>

      <Card className="p-2 md:p-3 grid grid-cols-4 gap-2 text-center">
        <Kpi label="Workers" value={String(kpis.workers)} />
        <Kpi label="Sites" value={String(kpis.sites)} />
        <Kpi label="Photos" value={String(kpis.photos)} />
        <Kpi label="Total ₹" value={`₹${fmtINR(kpis.rupees)}`} />
      </Card>

      {loading && <Card className="p-6 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading…</Card>}
      {!loading && filteredGrouped.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">No activity for selected filters.</Card>
      )}

      <Accordion type="multiple" defaultValue={filteredGrouped.map(([d]) => d)} className="space-y-2">
        {filteredGrouped.map(([date, bySup]) => {
          const supList = Array.from(bySup.values()).sort((a, b) => a.supName.localeCompare(b.supName));
          const dateWorkers = supList.reduce((s, x) => s + x.workerCount, 0);
          const dateRupees = supList.reduce((s, x) => s + x.rupees, 0);
          return (
            <AccordionItem key={date} value={date} className="border rounded-md bg-card">
              <AccordionTrigger className="px-3 py-2 hover:no-underline">
                <div className="flex w-full items-center justify-between gap-2 flex-wrap pr-2">
                  <span className="font-semibold text-sm md:text-base">{date}</span>
                  <span className="text-[11px] md:text-xs text-muted-foreground">
                    {supList.length} sup · {dateWorkers} workers · ₹{fmtINR(dateRupees)}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-2 md:px-3 pb-3 space-y-3">
                {supList.map((sup) => {
                  const ds = getDayState(sup.supId, date);
                  const dsc = dayStateClasses(ds);
                  const siteList = Array.from(sup.sites.values()).sort((a, b) => a.siteName.localeCompare(b.siteName));
                  return (
                    <div key={sup.supId} className={`border-2 rounded-md p-2 space-y-2 ${dsc.border} ${dsc.bg}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-semibold text-sm min-w-0 break-words">
                          <span>👤 {sup.supName}</span>
                          <StatusPill status={dsc.badge}>{dayStateLabel(ds)}</StatusPill>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {siteList.length} site(s) · {sup.workerCount} worker(s) · <b className="text-foreground">₹{fmtINR(sup.rupees)}</b>
                        </div>
                      </div>
                      {siteList.map((site) => (
                        <SiteBlock key={(site.siteId || "none")} site={site} contractors={contractors} openPhoto={openPhoto} photoUrls={photoUrls} />
                      ))}
                    </div>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {lightbox && (
        <PhotoLightbox open onClose={() => setLightbox(null)} src={lightbox.url} caption={lightbox.caption} lat={lightbox.lat} lng={lightbox.lng} />
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] md:text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm md:text-base font-semibold break-words">{value}</div>
    </div>
  );
}

function SiteBlock({
  site, contractors, openPhoto, photoUrls,
}: {
  site: any; contractors: Record<string, string>;
  openPhoto: (p: any, kind: "before" | "after", siteName: string) => void;
  photoUrls: Record<string, string>;
}) {
  const contractorEntries: [string, any[]][] = Array.from(site.workersByContractor.entries());
  const taskList: any[] = Array.from(site.tasks.values());
  return (
    <div className="border-l-2 border-primary/40 pl-2 md:pl-3 space-y-2">
      <div className="text-sm font-medium break-words">📍 {site.siteName}</div>

      {/* Workers grouped by contractor */}
      {contractorEntries.length > 0 && (
        <div className="rounded border bg-background/60 p-2 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Workers</div>
          {contractorEntries
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([cn, list]) => (
              <div key={cn} className="text-xs">
                <span className="text-primary font-semibold uppercase text-[10px] tracking-wide">{cn}: </span>
                <span className="text-foreground break-words">
                  {list.sort((a, b) => a.worker.name.localeCompare(b.worker.name)).map((w, i) => (
                    <span key={w.worker.id} className="whitespace-normal">
                      {i > 0 && ", "}
                      <span className="font-medium">{w.worker.name}</span>
                      {w.worker.designation && <span className="text-muted-foreground"> ({w.worker.designation})</span>}
                      {(w.days > 0 || w.hours > 0) && (
                        <span className="text-muted-foreground"> · {w.days.toFixed(1)}d {w.hours > 0 ? `${w.hours.toFixed(1)}h` : ""}</span>
                      )}
                    </span>
                  ))}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Work Status */}
      {(taskList.length > 0 || site.remark) && (
        <div className="rounded border bg-background/60 p-2 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Work Status</div>
          {taskList.sort((a, b) => a.description.localeCompare(b.description)).map((t) => (
            <div key={t.lineItemId} className="text-xs break-words">
              🛠 <span className="font-medium">{t.description}</span>
              {t.workDone > 0 && (
                <span className="text-muted-foreground"> — done: <b className="text-foreground">{t.workDone.toFixed(2)} {t.uom}</b></span>
              )}
            </div>
          ))}
          {taskList.length === 0 && <div className="text-xs text-muted-foreground italic">No task logged</div>}
          {site.remark && (
            <div className="text-xs text-muted-foreground pt-1 border-t break-words">
              <span className="font-semibold">Remark:</span> {site.remark}
            </div>
          )}
        </div>
      )}

      {/* Photos */}
      {(taskList.some((t) => t.beforePhotos.length + t.afterPhotos.length > 0)
        || site.unassignedPhotos.before.length + site.unassignedPhotos.after.length > 0) && (
        <div className="rounded border bg-background/60 p-2 space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Photos</div>
          {taskList.filter((t) => t.beforePhotos.length + t.afterPhotos.length > 0).map((t) => (
            <PhotoRow key={t.lineItemId} label={t.description} before={t.beforePhotos} after={t.afterPhotos}
              siteName={site.siteName} openPhoto={openPhoto} photoUrls={photoUrls} />
          ))}
          {(site.unassignedPhotos.before.length + site.unassignedPhotos.after.length) > 0 && (
            <PhotoRow label="(no task)" before={site.unassignedPhotos.before} after={site.unassignedPhotos.after}
              siteName={site.siteName} openPhoto={openPhoto} photoUrls={photoUrls} />
          )}
        </div>
      )}
    </div>
  );
}

function PhotoRow({ label, before, after, siteName, openPhoto, photoUrls }: {
  label: string; before: any[]; after: any[]; siteName: string;
  openPhoto: (p: any, kind: "before" | "after", siteName: string) => void;
  photoUrls: Record<string, string>;
}) {
  const time = (p: any) => {
    const s = p.captured_at || p.work_date;
    if (!s) return "";
    try {
      const d = new Date(s);
      return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch { return p.work_date || ""; }
  };
  const Thumb = ({ p, kind }: { p: any; kind: "B" | "A" }) => {
    const url = photoUrls[p.storage_path]; if (!url) return null;
    return (
      <button type="button" onClick={() => openPhoto(p, kind === "B" ? "before" : "after", siteName)} className="relative shrink-0">
        <img src={url} alt="" className="h-16 w-16 md:h-20 md:w-20 object-cover rounded border" />
        <span className={`absolute top-0.5 left-0.5 text-[9px] px-1 rounded ${kind === "B" ? "bg-amber-500 text-white" : "bg-emerald-600 text-white"}`}>{kind}</span>
        <span className="absolute bottom-0 left-0 right-0 text-[9px] leading-tight text-white bg-black/70 px-1 py-0.5 text-center break-words">{time(p)}</span>
      </button>
    );
  };
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium break-words">🛠 {label}</div>
      <div className="flex gap-1.5 flex-wrap">
        {before.map((p) => <Thumb key={p.id} p={p} kind="B" />)}
        {after.map((p) => <Thumb key={p.id} p={p} kind="A" />)}
      </div>
    </div>
  );
}
