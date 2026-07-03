import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DateRangePicker } from "@/components/DateRangePicker";
import { toast } from "sonner";
import { Trash2, Save } from "lucide-react";
import { AssignmentBadge } from "@/components/AssignmentBadge";

type Log = {
  id: string; date: string; worker_id: string | null; contractor_id: string | null;
  supervisor_id: string | null; line_item_id: string | null;
  wage_scale: number; hours: number; total_wages: number;
  contractor_share: number;
};
type Lookup = Record<string, string>;

const today = () => new Date().toISOString().slice(0, 10);
const totalHours = (l: { wage_scale: number; hours: number }) => Number(l.wage_scale) * 8 + Number(l.hours);

export default function DailyWages() {
  const { role, supervisorId, supervisors } = useRole();
  const isAdmin = role === "admin";

  const [range, setRange] = useState<{ from?: string; to?: string }>({ from: today(), to: today() });
  const [supFilter, setSupFilter] = useState<string>("all");
  const [contractorFilter, setContractorFilter] = useState<string>("all");
  const [siteFilter, setSiteFilter] = useState<string>("all");

  const [logs, setLogs] = useState<Log[]>([]);
  const [workers, setWorkers] = useState<Lookup>({});
  const [workerDes, setWorkerDes] = useState<Lookup>({});
  const [workerRate, setWorkerRate] = useState<Record<string, number>>({});
  const [workerShare, setWorkerShare] = useState<Record<string, number>>({});
  const [contractors, setContractors] = useState<Lookup>({});
  const [items, setItems] = useState<Lookup>({});
  const [itemProject, setItemProject] = useState<Record<string, string>>({});
  const [itemSiteId, setItemSiteId] = useState<Record<string, string | null>>({});
  const [siteNames, setSiteNames] = useState<Lookup>({});
  const [supervisorNames, setSupervisorNames] = useState<Lookup>({});
  const [assignNoMap, setAssignNoMap] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, { wage: string; hours: string }>>({});
  const [mySiteIds, setMySiteIds] = useState<string[]>([]);

  const load = async () => {
    const from = range.from || today();
    const to = range.to || from;
    let q = supabase.from("daily_logs").select("*").gte("date", from).lte("date", to).order("date", { ascending: false });
    if (!isAdmin && supervisorId) q = q.eq("supervisor_id", supervisorId);
    else if (isAdmin && supFilter !== "all") q = q.eq("supervisor_id", supFilter);
    if (contractorFilter !== "all") q = q.eq("contractor_id", contractorFilter);
    const { data, error } = await q;
    if (error) return toast.error(error.message);
    setLogs((data || []).map((x: any) => ({
      ...x,
      wage_scale: Number(x.wage_scale), hours: Number(x.hours), total_wages: Number(x.total_wages),
      contractor_share: Number(x.contractor_share || 0),
    })));
  };

  useEffect(() => {
    (async () => {
      const [{ data: ws }, { data: cs }, { data: lis }, { data: pos }, { data: sups }, { data: asgs }, { data: ars }, { data: stm }] = await Promise.all([
        supabase.from("workers").select("id,name,designation,daily_rate,contractor_share_amount"),
        supabase.from("contractors").select("id,name"),
        supabase.from("po_line_items").select("id,description,po_id"),
        supabase.from("purchase_orders").select("id,site,client_name"),
        supabase.from("supervisors").select("id,name"),
        supabase.from("line_item_assignments").select("line_item_id,supervisor_id,assignment_no,site_assignment_id"),
        supabase.from("areas").select("id,name").order("name"),
        supabase.from("sites").select("id,name").order("name"),
      ]);
      const wMap: Lookup = {}; const dMap: Lookup = {};
      const rMap: Record<string, number> = {}; const shMap: Record<string, number> = {};
      (ws || []).forEach((w: any) => {
        wMap[w.id] = w.name; dMap[w.id] = w.designation;
        rMap[w.id] = Number(w.daily_rate) || 0;
        shMap[w.id] = Number(w.contractor_share_amount) || 0;
      });
      const cMap: Lookup = {}; (cs || []).forEach((c: any) => { cMap[c.id] = c.name; });
      const poMap: Record<string, string> = {};
      (pos || []).forEach((p: any) => { poMap[p.id] = `${p.site} — ${p.client_name}`; });
      const iMap: Lookup = {}; const ipMap: Record<string, string> = {};
      (lis || []).forEach((i: any) => {
        iMap[i.id] = i.description;
        ipMap[i.id] = poMap[i.po_id] || "—";
      });
      const sMap: Lookup = {}; (sups || []).forEach((s: any) => { sMap[s.id] = s.name; });
      const aMap: Record<string, string> = {};
      // Derive (line_item, supervisor) -> resolved site id via stage-2 → stage-1 (area_id preferred).
      const { data: sasAll } = await supabase.from("site_assignments").select("id,site_id,area_id");
      const saToSite: Record<string, string> = {};
      (sasAll || []).forEach((s: any) => { saToSite[s.id] = s.area_id || s.site_id || ""; });
      const liSupSite: Record<string, string | null> = {};
      const mine = new Set<string>();
      (asgs || []).forEach((a: any) => {
        if (a.assignment_no) aMap[`${a.line_item_id}|${a.supervisor_id}`] = a.assignment_no;
        const sid = a.site_assignment_id ? (saToSite[a.site_assignment_id] || null) : null;
        liSupSite[`${a.line_item_id}|${a.supervisor_id}`] = sid;
        if (!isAdmin && supervisorId && a.supervisor_id === supervisorId && sid) mine.add(sid);
      });
      setMySiteIds(Array.from(mine));
      // siteNames: areas (new = Sites) + legacy sites for fallback display.
      const stNames: Lookup = {};
      (ars || []).forEach((s: any) => { stNames[s.id] = s.name; });
      (stm || []).forEach((s: any) => { if (!stNames[s.id]) stNames[s.id] = s.name; });
      setWorkers(wMap); setWorkerDes(dMap); setWorkerRate(rMap); setWorkerShare(shMap);
      setContractors(cMap); setItems(iMap);
      setItemProject(ipMap); setItemSiteId(liSupSite); setSiteNames(stNames);
      setSupervisorNames(sMap);
      setAssignNoMap(aMap);
    })();
  }, [isAdmin, supervisorId]);

  useEffect(() => {
    if (!isAdmin && siteFilter !== "all" && mySiteIds.length && !mySiteIds.includes(siteFilter)) {
      setSiteFilter("all");
    }
  }, [mySiteIds, isAdmin, siteFilter]);

  useEffect(() => { load(); }, [range.from, range.to, supFilter, contractorFilter, supervisorId, isAdmin]);

  const canEdit = (l: Log) => isAdmin || l.supervisor_id === supervisorId;

  const startEdit = (l: Log) =>
    setEdits((p) => ({ ...p, [l.id]: { wage: String(l.wage_scale), hours: String(l.hours) } }));

  const saveEdit = async (l: Log) => {
    const e = edits[l.id]; if (!e) return;
    const wage = Number(e.wage); const hours = Number(e.hours);
    if (Number.isNaN(wage) || Number.isNaN(hours)) return toast.error("Invalid numbers");
    const total = wage + hours / 8;
    const share = total * (workerShare[l.worker_id || ""] || 0);
    const { error } = await supabase.from("daily_logs").update({
      wage_scale: wage, hours, total_wages: total, contractor_share: share,
    }).eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEdits((p) => { const n = { ...p }; delete n[l.id]; return n; });
    load();
  };

  const del = async (l: Log) => {
    if (!confirm("Delete this entry?")) return;
    const { error } = await supabase.from("daily_logs").delete().eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  };

  const splitOf = (l: Log) => {
    const rate = workerRate[l.worker_id || ""] || 0;
    const total = Number(l.total_wages) * rate;
    const contractor = Math.min(Number(l.contractor_share || 0), total);
    return { total, contractor, worker: total - contractor };
  };

  const siteOfLog = (l: Log): string | null => {
    if (!l.line_item_id || !l.supervisor_id) return null;
    return itemSiteId[`${l.line_item_id}|${l.supervisor_id}`] || null;
  };

  const viewLogs = useMemo(() => {
    if (siteFilter === "all") return logs;
    return logs.filter((l) => siteOfLog(l) === siteFilter);
  }, [logs, siteFilter, itemSiteId]);

  const totals = useMemo(() => {
    let wUnits = 0, totalRs = 0, contractorRs = 0, hrs = 0;
    for (const l of viewLogs) {
      wUnits += Number(l.total_wages);
      hrs += totalHours(l);
      const s = splitOf(l);
      totalRs += s.total;
      contractorRs += s.contractor;
    }
    return { wages: wUnits, rupees: totalRs, workerRupees: totalRs - contractorRs, contractorRupees: contractorRs, hours: hrs, count: viewLogs.length };
  }, [viewLogs, workerRate]);

  type SiteSum = { siteId: string | null; name: string; count: number; rupees: number; workerRs: number; contractorRs: number };
  const bySite = useMemo<SiteSum[]>(() => {
    const m = new Map<string, SiteSum>();
    for (const l of viewLogs) {
      const sid = siteOfLog(l);
      const name = sid ? siteNames[sid] || "—" : "— No site";
      const key = sid || "__none";
      let r = m.get(key);
      if (!r) { r = { siteId: sid, name, count: 0, rupees: 0, workerRs: 0, contractorRs: 0 }; m.set(key, r); }
      const s = splitOf(l);
      r.count += 1; r.rupees += s.total; r.workerRs += s.worker; r.contractorRs += s.contractor;
    }
    return Array.from(m.values()).sort((a, b) => b.rupees - a.rupees);
  }, [viewLogs, itemSiteId, siteNames, workerRate]);

  // Build nested grouping: date -> project -> supervisor -> contractor -> Log[]
  type Bucket = { logs: Log[]; hours: number; wages: number; rupees: number; workerRs: number; contractorRs: number };
  type Tree = Record<string, Record<string, Record<string, Record<string, Bucket>>>>;
  const tree = useMemo<Tree>(() => {
    const t: Tree = {};
    for (const l of viewLogs) {
      const d = l.date;
      const p = (l.line_item_id && itemProject[l.line_item_id]) || "— No project";
      const s = (l.supervisor_id && supervisorNames[l.supervisor_id]) || "— No supervisor";
      const c = (l.contractor_id && contractors[l.contractor_id]) || "— No contractor";
      t[d] ??= {};
      t[d][p] ??= {};
      t[d][p][s] ??= {};
      t[d][p][s][c] ??= { logs: [], hours: 0, wages: 0, rupees: 0, workerRs: 0, contractorRs: 0 };
      const b = t[d][p][s][c];
      const sp = splitOf(l);
      b.logs.push(l);
      b.hours += totalHours(l);
      b.wages += Number(l.total_wages);
      b.rupees += sp.total;
      b.workerRs += sp.worker;
      b.contractorRs += sp.contractor;
    }
    return t;
  }, [viewLogs, itemProject, supervisorNames, contractors, workerRate]);

  const sumLevel = (entries: Iterable<Bucket>) => {
    let hours = 0, wages = 0, rupees = 0, workerRs = 0, contractorRs = 0, count = 0;
    for (const e of entries) {
      hours += e.hours; wages += e.wages; rupees += e.rupees;
      workerRs += e.workerRs; contractorRs += e.contractorRs;
      count += e.logs.length;
    }
    return { hours, wages, rupees, workerRs, contractorRs, count };
  };

  const fmtSub = (s: { hours: number; wages: number; rupees: number; workerRs: number; contractorRs: number; count: number }) =>
    s.contractorRs > 0
      ? `${s.count} · ${s.hours.toFixed(1)}h · Worker ₹${s.workerRs.toFixed(0)} · Contractor ₹${s.contractorRs.toFixed(0)} · Total ₹${s.rupees.toFixed(0)}`
      : `${s.count} · ${s.hours.toFixed(1)}h · ${s.wages.toFixed(2)}w · ₹${s.rupees.toFixed(0)}`;

  const fmtDateShort = (iso: string) => {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}-${mm}`;
  };
  const fmtFull = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}-${m}-${y}`;
  };

  const assignNoFor = (l: Log) =>
    (l.line_item_id && l.supervisor_id)
      ? assignNoMap[`${l.line_item_id}|${l.supervisor_id}`] || null
      : null;

  type AsgSum = { no: string; project: string; description: string; count: number; wages: number; hours: number; rupees: number; workerRs: number; contractorRs: number };
  const byAssignment = useMemo<AsgSum[]>(() => {
    const m = new Map<string, AsgSum>();
    for (const l of viewLogs) {
      const no = assignNoFor(l);
      if (!no) continue;
      let r = m.get(no);
      if (!r) {
        r = {
          no,
          project: (l.line_item_id && itemProject[l.line_item_id]) || "—",
          description: (l.line_item_id && items[l.line_item_id]) || "—",
          count: 0, wages: 0, hours: 0, rupees: 0, workerRs: 0, contractorRs: 0,
        };
        m.set(no, r);
      }
      const s = splitOf(l);
      r.count += 1;
      r.wages += Number(l.total_wages);
      r.hours += totalHours(l);
      r.rupees += s.total;
      r.workerRs += s.worker;
      r.contractorRs += s.contractor;
    }
    return Array.from(m.values()).sort((a, b) => a.no.localeCompare(b.no));
  }, [viewLogs, assignNoMap, itemProject, items, workerRate]);

  const renderEntry = (l: Log) => {
    const e = edits[l.id];
    const editing = !!e;
    const rate = workerRate[l.worker_id || ""] || 0;
    const shareAmt = workerShare[l.worker_id || ""] || 0;
    const tHrs = editing
      ? Number(e.wage || 0) * 8 + Number(e.hours || 0)
      : totalHours(l);
    const tWageUnits = editing
      ? Number(e.wage || 0) + Number(e.hours || 0) / 8
      : Number(l.total_wages);
    const tRupees = tWageUnits * rate;
    const contractorRs = editing ? tWageUnits * shareAmt : Number(l.contractor_share || 0);
    const workerRs = Math.max(tRupees - contractorRs, 0);
    const asgNo = assignNoFor(l);
    return (
      <Card key={l.id} className="p-3 space-y-2 text-sm">
        <div className="flex justify-between gap-2">
          <div className="font-medium truncate flex items-center gap-2 flex-wrap min-w-0">
            <AssignmentBadge no={asgNo} />
            <span className="truncate">
              {workers[l.worker_id || ""] || "—"}
              <span className="text-xs text-muted-foreground ml-1">({workerDes[l.worker_id || ""]})</span>
            </span>
          </div>
          <div className="text-right whitespace-nowrap">
            <div className="font-semibold">{rate > 0 ? `₹${tRupees.toFixed(2)}` : `${tWageUnits.toFixed(2)} wages`}</div>
            {rate > 0 && contractorRs > 0 && (
              <div className="text-xs text-muted-foreground flex flex-col">
                <span>{workers[l.worker_id || ""] || "Worker"}: ₹{workerRs.toFixed(0)}</span>
                <span>{contractors[l.contractor_id || ""] || "Contractor"}: ₹{contractorRs.toFixed(0)}</span>
              </div>
            )}
            {rate > 0 && contractorRs === 0 && (
              <div className="text-xs text-muted-foreground">{tWageUnits.toFixed(2)} wages × ₹{rate}</div>
            )}
            {rate === 0 && <div className="text-xs text-destructive">rate not set</div>}
          </div>
        </div>
        <div className="text-xs text-muted-foreground break-words">{items[l.line_item_id || ""] || "—"}</div>
        {editing ? (
          <div className="grid grid-cols-3 gap-2 items-end">
            <div>
              <div className="text-xs text-muted-foreground">Wage</div>
              <Input type="number" value={e.wage}
                onChange={(ev) => setEdits((p) => ({ ...p, [l.id]: { ...e, wage: ev.target.value } }))} />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Extra Hrs</div>
              <Input type="number" value={e.hours}
                onChange={(ev) => setEdits((p) => ({ ...p, [l.id]: { ...e, hours: ev.target.value } }))} />
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Total Hrs</div>
              <div className="font-semibold">{tHrs.toFixed(1)}</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>Wage: <span className="text-foreground">{l.wage_scale}</span></span>
            <span>Extra Hrs: <span className="text-foreground">{l.hours}</span></span>
            <span>Total Hrs: <span className="text-foreground font-medium">{tHrs.toFixed(1)}</span></span>
          </div>
        )}
        {canEdit(l) && (
          <div className="flex gap-2 pt-1 border-t">
            {editing ? (
              <Button size="sm" onClick={() => saveEdit(l)}><Save className="h-4 w-4 mr-1" />Save</Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => startEdit(l)}>Edit</Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => del(l)} className="ml-auto text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-4 max-w-6xl">
      <h2 className="text-xl font-semibold">Daily Wages</h2>
      <Card className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Date range</div>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Site</div>
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              {Object.entries(siteNames)
                .filter(([id]) => isAdmin || mySiteIds.includes(id))
                .map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {isAdmin && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Supervisor</div>
            <Select value={supFilter} onValueChange={setSupFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {supervisors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Contractor</div>
          <Select value={contractorFilter} onValueChange={setContractorFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {Object.entries(contractors).map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-3 flex flex-wrap gap-2 text-sm">
        <Badge variant="secondary">Entries: {totals.count}</Badge>
        <Badge variant="secondary">Hours: {totals.hours.toFixed(1)}</Badge>
        <Badge variant="secondary">Worker ₹: {totals.workerRupees.toFixed(0)}</Badge>
        <Badge variant="secondary">Contractor ₹: {totals.contractorRupees.toFixed(0)}</Badge>
        <Badge>Total ₹: {totals.rupees.toFixed(2)}</Badge>
      </Card>

      {bySite.length > 0 && (
        <Card className="p-3 space-y-2">
          <div className="text-sm font-semibold">Wages by Site</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {bySite.map((s) => (
              <div key={s.siteId || s.name} className="border rounded p-2 bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">📍 {s.name}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{s.count} entr{s.count === 1 ? "y" : "ies"}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-2">
                  {s.contractorRs > 0 && <span>Worker ₹{s.workerRs.toFixed(0)} · Contr ₹{s.contractorRs.toFixed(0)}</span>}
                  <span className="font-semibold text-foreground">Total ₹{s.rupees.toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {byAssignment.length > 0 && (
        <Card className="p-3 space-y-2">
          <div className="text-sm font-semibold">Wages by Assignment</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {byAssignment.map((r) => (
              <div key={r.no} className="border rounded p-2 bg-muted/20">
                <div className="flex items-center gap-2 flex-wrap">
                  <AssignmentBadge no={r.no} size="md" />
                  <span className="text-xs text-muted-foreground truncate">{r.project}</span>
                </div>
                <div className="text-xs mt-1 truncate" title={r.description}>{r.description}</div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-2">
                  <span>{r.count} entr{r.count === 1 ? "y" : "ies"}</span>
                  <span>· {r.wages.toFixed(2)}w</span>
                  <span>· {r.hours.toFixed(1)}h</span>
                  {r.contractorRs > 0 && <span>· Worker ₹{r.workerRs.toFixed(0)} · Contr ₹{r.contractorRs.toFixed(0)}</span>}
                  <span className="font-semibold text-foreground">· Total ₹{r.rupees.toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}


      {viewLogs.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">No entries.</Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {Object.entries(tree).sort(([a], [b]) => b.localeCompare(a)).map(([date, projs]) => {
            const dateBuckets = Object.values(projs).flatMap((sm) =>
              Object.values(sm).flatMap((cm) => Object.values(cm)),
            );
            const dSum = sumLevel(dateBuckets);
            return (
              <AccordionItem key={date} value={date} className="border rounded-md bg-card">
                <AccordionTrigger className="px-2 py-2 sm:px-3 hover:no-underline">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center w-full gap-0.5 sm:gap-2 pr-2 min-w-0 text-left">
                    <span className="font-semibold truncate">
                      <span className="sm:hidden">{fmtDateShort(date)}</span>
                      <span className="hidden sm:inline">{fmtFull(date)}</span>
                    </span>
                    <span className="text-[11px] sm:text-xs text-muted-foreground whitespace-nowrap">{fmtSub(dSum)}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-1 sm:px-2 pb-2">
                  <Accordion type="multiple" className="space-y-1">
                    {Object.entries(projs).map(([proj, sups]) => {
                      const pSum = sumLevel(Object.values(sups).flatMap((cm) => Object.values(cm)));
                      return (
                        <AccordionItem key={proj} value={proj} className="border rounded bg-muted/30">
                          <AccordionTrigger className="px-2 py-2 sm:px-3 hover:no-underline">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center w-full gap-0.5 sm:gap-2 pr-2 min-w-0 text-left">
                              <span className="font-medium text-primary truncate">{proj}</span>
                              <span className="text-[11px] sm:text-xs text-muted-foreground whitespace-nowrap">{fmtSub(pSum)}</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-1 sm:px-2 pb-2">
                            <Accordion type="multiple" className="space-y-1">
                              {Object.entries(sups).map(([sup, cons]) => {
                                const sSum = sumLevel(Object.values(cons));
                                return (
                                  <AccordionItem key={sup} value={sup} className="border rounded bg-background">
                                    <AccordionTrigger className="px-2 py-2 sm:px-3 hover:no-underline">
                                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center w-full gap-0.5 sm:gap-2 pr-2 min-w-0 text-left">
                                        <span className="font-medium truncate">👷 {sup}</span>
                                        <span className="text-[11px] sm:text-xs text-muted-foreground whitespace-nowrap">{fmtSub(sSum)}</span>
                                      </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-1 sm:px-2 pb-2">
                                      <Accordion type="multiple" className="space-y-1">
                                        {Object.entries(cons).map(([con, bucket]) => {
                                          const cSum = { hours: bucket.hours, wages: bucket.wages, rupees: bucket.rupees, workerRs: bucket.workerRs, contractorRs: bucket.contractorRs, count: bucket.logs.length };
                                          return (
                                            <AccordionItem key={con} value={con} className="border rounded bg-muted/20">
                                              <AccordionTrigger className="px-2 py-2 sm:px-3 hover:no-underline">
                                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center w-full gap-0.5 sm:gap-2 pr-2 min-w-0 text-left">
                                                  <span className="truncate">🏗 {con}</span>
                                                  <span className="text-[11px] sm:text-xs text-muted-foreground whitespace-nowrap">{fmtSub(cSum)}</span>
                                                </div>
                                              </AccordionTrigger>
                                              <AccordionContent className="px-1 sm:px-2 pb-2 space-y-2">
                                                {bucket.logs.map(renderEntry)}
                                              </AccordionContent>
                                            </AccordionItem>
                                          );
                                        })}
                                      </Accordion>
                                    </AccordionContent>
                                  </AccordionItem>
                                );
                              })}
                            </Accordion>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
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
