import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { L, tx } from "@/components/BilingualLabel";
import { EmployeePhoto } from "@/components/EmployeePhoto";
import { StickyActionBar } from "@/components/StickyActionBar";
import { Users, Lock, ChevronDown, ChevronRight, UserMinus, CalendarClock, Plus } from "lucide-react";
import { ReleaseDialog, ReleaseTarget } from "@/components/sup/ReleaseDialog";

type Worker = {
  id: string; name: string; designation: string; contractor_id: string | null;
  photo_url: string | null; mobile: string | null; scrum_id: string | null;
  daily_rate: number | null;
  is_busy: boolean; current_supervisor_id: string | null; current_line_item_id: string | null;
};
type Contractor = { id: string; name: string };
type RosterRow = { id: string; worker_id: string; work_date: string; released_at: string | null };
type BusyInfo = { supervisorName: string; siteName: string };

const today = () => new Date().toISOString().slice(0, 10);

export default function Roster() {
  const { supervisorId } = useRole();
  const nav = useNavigate();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [todayRoster, setTodayRoster] = useState<RosterRow[]>([]);
  const [carryOver, setCarryOver] = useState<RosterRow[]>([]);
  const [busyMap, setBusyMap] = useState<Record<string, BusyInfo>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [openToday, setOpenToday] = useState(false);
  const [openCarry, setOpenCarry] = useState(false);
  const [openPick, setOpenPick] = useState(false);
  const [openDate, setOpenDate] = useState<Record<string, boolean>>({});
  const [releaseTarget, setReleaseTarget] = useState<ReleaseTarget | null>(null);
  const date = today();

  const load = async () => {
    if (!supervisorId) return;
    const [{ data: ws }, { data: cs }, { data: rTd }, { data: rPrev }, { data: sups }] = await Promise.all([
      supabase.from("workers").select("*").order("name"),
      supabase.from("contractors").select("id,name"),
      supabase.from("sup_daily_roster")
        .select("id,worker_id,work_date,released_at")
        .eq("supervisor_id", supervisorId).eq("work_date", date),
      supabase.from("sup_daily_roster")
        .select("id,worker_id,work_date,released_at")
        .eq("supervisor_id", supervisorId).is("released_at", null).lt("work_date", date)
        .order("work_date", { ascending: false }),
      supabase.from("supervisors").select("id,name"),
    ]);
    const wsArr = (ws as Worker[]) || [];
    setWorkers(wsArr);
    setContractors((cs as any) || []);
    setTodayRoster(((rTd as any) || []).filter((r: RosterRow) => !r.released_at));
    setCarryOver((rPrev as any) || []);

    // Build busy info for workers busy under other supervisors
    const supMap: Record<string, string> = {};
    ((sups as any) || []).forEach((s: any) => (supMap[s.id] = s.name));
    const busyWorkers = wsArr.filter((w) => w.is_busy && w.current_supervisor_id && w.current_supervisor_id !== supervisorId && w.current_line_item_id);
    const lineIds = Array.from(new Set(busyWorkers.map((w) => w.current_line_item_id!)));
    const bm: Record<string, BusyInfo> = {};
    if (lineIds.length) {
      const { data: lia } = await supabase.from("line_item_assignments")
        .select("id, area_id").in("id", lineIds);
      const areaIds = Array.from(new Set(((lia as any) || []).map((x: any) => x.area_id).filter(Boolean))) as string[];
      const areaName: Record<string, string> = {};
      if (areaIds.length) {
        const { data: ar } = await supabase.from("areas").select("id,name").in("id", areaIds);
        ((ar as any) || []).forEach((a: any) => (areaName[a.id] = a.name));
      }
      const liaMap: Record<string, string | null> = {};
      ((lia as any) || []).forEach((x: any) => (liaMap[x.id] = x.area_id));
      busyWorkers.forEach((w) => {
        const aId = liaMap[w.current_line_item_id!];
        bm[w.id] = {
          supervisorName: supMap[w.current_supervisor_id!] || "—",
          siteName: aId ? (areaName[aId] || "—") : "—",
        };
      });
    }
    setBusyMap(bm);
    setPicked(new Set());
  };
  useEffect(() => { load(); }, [supervisorId]);

  const todayWorkerIds = useMemo(() => new Set(todayRoster.map((r) => r.worker_id)), [todayRoster]);
  

  const carryByWorker = useMemo(() => {
    const m: Record<string, RosterRow> = {};
    carryOver.forEach((r) => { if (!m[r.worker_id]) m[r.worker_id] = r; });
    return m;
  }, [carryOver]);

  const pickable = useMemo(() => workers.filter((w) => !todayWorkerIds.has(w.id)), [workers, todayWorkerIds]);

  const filteredPick = useMemo(() => pickable.filter((w) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return w.name.toLowerCase().includes(q)
      || (w.mobile || "").includes(search)
      || (w.scrum_id || "").toLowerCase().includes(q);
  }), [pickable, search]);

  const grouped = useMemo(() => contractors.map((c) => ({
    c, ws: filteredPick.filter((w) => w.contractor_id === c.id),
  })).filter((g) => g.ws.length > 0), [contractors, filteredPick]);

  const carryByDate = useMemo(() => {
    const m = new Map<string, RosterRow[]>();
    carryOver.forEach((r) => m.set(r.work_date, [...(m.get(r.work_date) || []), r]));
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [carryOver]);

  const wmap = useMemo(() => {
    const m: Record<string, Worker> = {};
    workers.forEach((w) => (m[w.id] = w));
    return m;
  }, [workers]);

  const blockedByCarry = carryOver.length > 0;

  const toggle = (id: string) => {
    const w = wmap[id]; if (!w) return;
    if (busyMap[id] || carryByWorker[id]) return;
    if (blockedByCarry) { toast.error(tx("unreleased_workers")); return; }
    setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const save = async () => {
    if (!supervisorId || saving || picked.size === 0) return;
    if (blockedByCarry) { toast.error(tx("unreleased_workers")); return; }
    setSaving(true);
    try {
      const rows = Array.from(picked).map((wid) => ({ supervisor_id: supervisorId, worker_id: wid, work_date: date }));
      const { error } = await supabase.from("sup_daily_roster").insert(rows);
      if (error) { toast.error(error.message); return; }
      toast.success(tx("roster_saved"));
      load();
    } finally { setSaving(false); }
  };

  // Did this carry-over worker actually have a task on r.work_date?
  // Has task if: (a) a daily_logs row exists for (sup,worker,date), OR
  // (b) the worker is still marked busy under THIS supervisor (assignment never closed).
  const workerHadTask = async (r: RosterRow): Promise<boolean> => {
    const w = wmap[r.worker_id];
    if (w?.is_busy && w.current_supervisor_id === supervisorId) return true;
    const { data } = await supabase.from("daily_logs")
      .select("id").eq("supervisor_id", supervisorId!)
      .eq("worker_id", r.worker_id).eq("date", r.work_date).maybeSingle();
    return !!data;
  };

  // Carry-over with NO task → just release (and optionally add to today). No dialog.
  const directReleaseNoTask = async (r: RosterRow, alsoContinue: boolean) => {
    const { error } = await supabase.from("sup_daily_roster")
      .update({ released_at: new Date().toISOString(), release_reason: "no_task" })
      .eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    if (alsoContinue) {
      const { error: insErr } = await supabase.from("sup_daily_roster").insert({
        supervisor_id: supervisorId!, worker_id: r.worker_id, work_date: date,
      });
      if (insErr && !/duplicate/i.test(insErr.message)) { toast.error(insErr.message); return; }
      toast.success("Continued to today");
    } else {
      toast.success("Released");
    }
    load();
  };

  const continueToday = async (r: RosterRow) => {
    if (todayWorkerIds.has(r.worker_id)) { toast.info("Already in today's team"); return; }
    const w = wmap[r.worker_id]; if (!w) return;
    const hadTask = await workerHadTask(r);
    if (!hadTask) { directReleaseNoTask(r, true); return; }
    setReleaseTarget({
      rosterId: r.id, workerId: w.id, workerName: w.name,
      defaultDate: r.work_date, defaultWage: Number(w.daily_rate || 0),
      supervisorId: supervisorId!, contractorId: w.contractor_id,
      mode: "continue", todayDate: date, askReason: false,
    });
  };


  const openRelease = async (r: RosterRow, askReason: boolean) => {
    const w = wmap[r.worker_id]; if (!w) return;
    // Carry-over release (askReason=false) with no task → skip dialog
    if (!askReason) {
      const hadTask = await workerHadTask(r);
      if (!hadTask) { directReleaseNoTask(r, false); return; }
    }
    setReleaseTarget({
      rosterId: r.id, workerId: w.id, workerName: w.name,
      defaultDate: r.work_date, defaultWage: Number(w.daily_rate || 0),
      supervisorId: supervisorId!, contractorId: w.contractor_id,
      askReason,
    });
  };

  if (!supervisorId) {
    return <Card className="p-6 text-center text-muted-foreground text-sm"><L k="pick_supervisor" /></Card>;
  }

  return (
    <div className="space-y-3 pb-32">
      {/* CARRY-OVER — unreleased from yesterday */}
      <Collapsible open={openCarry} onOpenChange={setOpenCarry}>
        <Card className="p-2 border-amber-300">
          <CollapsibleTrigger className="w-full flex items-center gap-2 p-1">
            {openCarry ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <CalendarClock className="h-4 w-4 text-amber-600" />
            <span className="font-semibold flex-1 text-left"><L k="carry_over" layout="inline" /></span>
            <Badge variant="secondary">{carryOver.length}</Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {carryOver.length === 0 && <div className="text-xs text-muted-foreground p-2">{tx("no_workers")}</div>}
            <div className="text-[11px] text-muted-foreground px-1"><L k="unreleased_workers" /></div>
            {carryByDate.map(([d, rows]) => {
              const o = openDate[d] ?? false;
              return (
                <Collapsible key={d} open={o} onOpenChange={(v) => setOpenDate((p) => ({ ...p, [d]: v }))}>
                  <div className="border rounded-md">
                    <CollapsibleTrigger className="w-full flex items-center gap-2 p-2 text-left">
                      {o ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      <span className="text-xs font-medium flex-1">{d}</span>
                      <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="p-2 pt-0 space-y-1">
                      {rows.map((r) => {
                        const w = wmap[r.worker_id]; if (!w) return null;
                        return (
                          <div key={r.id} className="flex items-center gap-2 p-2 border rounded bg-background">
                            <EmployeePhoto path={w.photo_url} name={w.name} subtitle={w.designation} />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium leading-tight truncate">{w.name}</div>
                              <div className="text-[11px] text-muted-foreground truncate">{w.designation}</div>
                            </div>
                            <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => continueToday(r)} disabled={todayWorkerIds.has(w.id)}>
                              <Plus className="h-3 w-3 mr-1" /><L k="continue_today" oneLine />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive" onClick={() => openRelease(r, false)}>
                              <UserMinus className="h-3 w-3 mr-1" /><L k="release" oneLine />
                            </Button>
                          </div>
                        );
                      })}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* TODAY'S TEAM */}
      <Collapsible open={openToday} onOpenChange={setOpenToday}>
        <Card className="p-2">
          <CollapsibleTrigger className="w-full flex items-center gap-2 p-1">
            {openToday ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Users className="h-4 w-4 text-primary" />
            <span className="font-semibold flex-1 text-left"><L k="todays_team" layout="inline" /></span>
            <Badge>{todayRoster.length}</Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {todayRoster.length === 0 && <div className="text-xs text-muted-foreground p-2">{tx("no_workers")}</div>}
            {contractors.map((c) => {
              const rows = todayRoster
                .filter((r) => wmap[r.worker_id]?.contractor_id === c.id)
                .sort((a, b) => (wmap[a.worker_id]?.name || "").localeCompare(wmap[b.worker_id]?.name || ""));
              if (rows.length === 0) return null;
              return (
                <div key={c.id} className="space-y-1">
                  <div className="text-xs font-medium text-primary px-1">{c.name}</div>
                  {rows.map((r) => {
                    const w = wmap[r.worker_id]; if (!w) return null;
                    return (
                      <div key={r.id} className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                        <Lock className="h-3 w-3 text-muted-foreground" />
                        <EmployeePhoto path={w.photo_url} name={w.name} subtitle={w.designation} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium leading-tight truncate">{w.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{w.designation}</div>
                        </div>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => openRelease(r, true)}>
                          <UserMinus className="h-4 w-4 mr-1" /><L k="release" oneLine />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </CollapsibleContent>

        </Card>
      </Collapsible>

      {/* PICK WORKERS */}
      <Collapsible open={openPick} onOpenChange={setOpenPick}>
        <Card className="p-2">
          <CollapsibleTrigger className="w-full flex items-center gap-2 p-1">
            {openPick ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Users className="h-4 w-4 text-primary" />
            <span className="font-semibold flex-1 text-left"><L k="pick_workers_for_today" layout="inline" /></span>
            <Badge variant="default">+{picked.size}</Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {blockedByCarry && (
              <div className="text-[11px] p-2 rounded bg-amber-50 border border-amber-300 text-amber-800">
                <L k="unreleased_workers" />
              </div>
            )}
            <Input placeholder={tx("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
            {grouped.length === 0 && (
              <div className="p-6 text-center text-muted-foreground text-sm"><L k="no_workers" /></div>
            )}
            {grouped.map(({ c, ws }) => (
              <div key={c.id} className="space-y-1">
                <div className="text-xs font-medium text-primary px-1">{c.name}</div>
                {ws.map((w) => {
                  const busy = busyMap[w.id];
                  const carry = carryByWorker[w.id];
                  const disabled = !!busy || !!carry || blockedByCarry;
                  const checked = picked.has(w.id);
                  return (
                    <label
                      key={w.id}
                      className={`flex items-center gap-2 p-2 rounded border min-h-[56px] ${
                        disabled ? "bg-muted/50 cursor-not-allowed opacity-70"
                          : checked ? "bg-primary/10 border-primary cursor-pointer"
                          : "hover:bg-accent/40 cursor-pointer"
                      }`}
                    >
                      <Checkbox checked={checked} disabled={disabled} onCheckedChange={() => toggle(w.id)} className="h-5 w-5" />
                      <EmployeePhoto path={w.photo_url} name={w.name} subtitle={w.designation} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm leading-tight truncate">{w.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {w.designation}{w.mobile ? ` · 📱 ${w.mobile}` : ""}
                        </div>
                        {busy && (
                          <div className="text-[10px] text-amber-700 truncate">
                            <L k="assigned_to" oneLine />: {busy.siteName} · {busy.supervisorName}
                          </div>
                        )}
                        {!busy && carry && (
                          <div className="text-[10px] text-amber-700 truncate">
                            <L k="carry_over" oneLine /> · {carry.work_date}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            ))}
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <StickyActionBar>
        <Button className="w-full h-12 text-base shadow-lg" onClick={save} disabled={saving || picked.size === 0 || blockedByCarry}>
          {saving ? "…" : <><L k="add_to_team" layout="inline" /> ({picked.size})</>}
        </Button>
      </StickyActionBar>

      <ReleaseDialog target={releaseTarget} onClose={() => setReleaseTarget(null)} onDone={load} />
    </div>
  );
}
