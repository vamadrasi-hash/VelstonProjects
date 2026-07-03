import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/DatePicker";
import { L } from "@/components/BilingualLabel";
import { toast } from "sonner";

type Worker = {
  id: string; name: string; designation: string; contractor_id: string | null;
  daily_rate: number; contractor_share_amount: number;
  is_busy: boolean; current_supervisor_id: string | null; current_area_id: string | null;
};
type Carry = { worker: Worker; pending_dates: string[] };

const today = () => new Date().toISOString().slice(0, 10);

export default function Wages() {
  const { supervisorId } = useRole();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [areas, setAreas] = useState<Record<string, string>>({});
  const [contractors, setContractors] = useState<Record<string, string>>({});
  const [roster, setRoster] = useState<{ worker_id: string; work_date: string; released_at: string | null }[]>([]);
  const [todayLogs, setTodayLogs] = useState<Record<string, { id: string; wage_scale: number; hours: number; zero_reason: string | null }>>({});
  const [rows, setRows] = useState<Record<string, { wage: string; hours: string; reason: string }>>({});
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    if (!supervisorId) return;
    const [{ data: ws }, { data: ars }, { data: cts }, { data: rst }, { data: dl }] = await Promise.all([
      supabase.from("workers").select("*").eq("is_busy", true).eq("current_supervisor_id", supervisorId),
      supabase.from("areas").select("id,name"),
      supabase.from("contractors").select("id,name"),
      supabase.from("sup_daily_roster").select("worker_id,work_date,released_at").eq("supervisor_id", supervisorId),
      supabase.from("daily_logs").select("id,worker_id,wage_scale,hours,zero_reason").eq("supervisor_id", supervisorId).eq("date", date),
    ]);
    setWorkers((ws as any) || []);
    const am: Record<string, string> = {}; ((ars as any) || []).forEach((a: any) => (am[a.id] = a.name)); setAreas(am);
    const cm: Record<string, string> = {}; ((cts as any) || []).forEach((c: any) => (cm[c.id] = c.name)); setContractors(cm);
    setRoster((rst as any) || []);
    const tm: Record<string, any> = {};
    ((dl as any) || []).forEach((l: any) => { if (l.worker_id) tm[l.worker_id] = l; });
    setTodayLogs(tm);
    // Pre-fill rows from existing logs
    const init: typeof rows = {};
    ((dl as any) || []).forEach((l: any) => {
      if (l.worker_id) init[l.worker_id] = {
        wage: String(l.wage_scale ?? ""), hours: String(l.hours ?? ""), reason: l.zero_reason || "",
      };
    });
    setRows(init);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [supervisorId, date]);

  // Carry-over: roster rows from work_date < today, released_at IS NULL, worker still busy with me
  const carryOver = useMemo<Carry[]>(() => {
    const tDay = today();
    const map = new Map<string, Set<string>>();
    roster.forEach((r) => {
      if (r.work_date < tDay && !r.released_at) {
        if (!map.has(r.worker_id)) map.set(r.worker_id, new Set());
        map.get(r.worker_id)!.add(r.work_date);
      }
    });
    return Array.from(map.entries())
      .map(([wid, dates]) => {
        const w = workers.find((x) => x.id === wid);
        if (!w) return null;
        return { worker: w, pending_dates: Array.from(dates).sort() };
      })
      .filter(Boolean) as Carry[];
  }, [roster, workers]);

  const setR = (id: string, p: Partial<{ wage: string; hours: string; reason: string }>) =>
    setRows((r) => ({ ...r, [id]: { wage: "", hours: "", reason: "", ...(r[id] || {}), ...p } }));

  const save = async (w: Worker) => {
    if (saving) return;
    const r = rows[w.id] || { wage: "", hours: "", reason: "" };
    if (r.wage === "" || r.hours === "") { toast.error("Wage & hours required"); return; }
    const wage = Number(r.wage), hours = Number(r.hours);
    if (!Number.isFinite(wage) || !Number.isFinite(hours)) { toast.error("Invalid numbers"); return; }
    const totalDays = wage + hours / 8;
    if (totalDays === 0 && !r.reason.trim()) { toast.error("Reason required when wage=0"); return; }
    const rate = Number(w.daily_rate || 0);
    const share = totalDays * Number(w.contractor_share_amount || 0);
    setSaving(w.id);
    try {
      const existing = todayLogs[w.id];
      const payload: any = {
        wage_scale: wage, hours, total_wages: totalDays * rate,
        contractor_share: share, zero_reason: totalDays === 0 ? r.reason.trim() : null,
      };
      let err: any;
      if (existing) {
        ({ error: err } = await supabase.from("daily_logs").update(payload).eq("id", existing.id));
      } else {
        ({ error: err } = await supabase.from("daily_logs").insert({
          ...payload,
          supervisor_id: supervisorId, worker_id: w.id, contractor_id: w.contractor_id,
          line_item_id: null, work_done: 0, remark: "",
          date,
        }));
      }
      if (err) { toast.error(err.message); return; }
      // mark today's roster row released
      await supabase.from("sup_daily_roster")
        .update({ released_at: new Date().toISOString() })
        .eq("supervisor_id", supervisorId).eq("worker_id", w.id).eq("work_date", date);
      // free the worker
      await supabase.from("workers").update({
        is_busy: false, current_supervisor_id: null, current_area_id: null, current_line_item_id: null,
      }).eq("id", w.id);
      toast.success(`Saved wage for ${w.name}`);
      await load();
    } finally { setSaving(null); }
  };

  // Group today's workers by contractor sorted by name
  const todayGroups = useMemo(() => {
    const m = new Map<string, Worker[]>();
    workers.forEach((w) => {
      const k = w.contractor_id || "__none";
      m.set(k, [...(m.get(k) || []), w]);
    });
    return Array.from(m.entries())
      .map(([k, list]) => ({
        key: k, name: k === "__none" ? "—" : (contractors[k] || "—"),
        list: list.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [workers, contractors]);

  if (!supervisorId) {
    return <Card className="p-6 text-center text-muted-foreground text-sm"><L k="pick_supervisor" /></Card>;
  }

  return (
    <div className="space-y-3 pb-24">
      <Card className="p-3 space-y-2">
        <div className="font-semibold"><L k="wages" layout="inline" /></div>
        <DatePicker value={date} onChange={setDate} className="w-full sm:w-56" />
        <div className="text-[11px] text-muted-foreground">One wage row per worker per day. Saving releases the worker for the day.</div>
      </Card>

      {carryOver.length > 0 && (
        <Card className="p-3 border-rose-500/40 bg-rose-500/5">
          <div className="text-sm font-semibold text-rose-700 dark:text-rose-300 mb-1">
            <L k="carry_over_pending" layout="inline" />
          </div>
          <div className="text-xs text-muted-foreground mb-2">
            Switch the date above to a pending day to record their wage.
          </div>
          <div className="space-y-1">
            {carryOver.map((c) => (
              <div key={c.worker.id} className="flex items-center justify-between text-sm border-t pt-1">
                <div className="min-w-0">
                  <div className="font-medium">{c.worker.name}</div>
                  <div className="text-[11px] text-muted-foreground">{c.pending_dates.join(", ")}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {workers.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm"><L k="no_workers_today" /></Card>
      ) : (
        <Accordion type="multiple" defaultValue={todayGroups.map((g) => g.key)} className="space-y-2">
          {todayGroups.map((g) => (
            <AccordionItem key={g.key} value={g.key} className="border rounded-md bg-card">
              <AccordionTrigger className="px-3 py-2 hover:no-underline">
                <div className="flex items-center gap-2 w-full pr-2 min-w-0">
                  <Badge variant="secondary">{g.name}</Badge>
                  <span className="text-xs text-muted-foreground">{g.list.length} worker(s)</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-2 pb-2 space-y-2">
                {g.list.map((w) => {
                  const r = rows[w.id] || { wage: "", hours: "", reason: "" };
                  const wage = Number(r.wage || 0), hours = Number(r.hours || 0);
                  const totalDays = wage + hours / 8;
                  const rate = Number(w.daily_rate || 0);
                  const totalRs = totalDays * rate;
                  const siteName = areas[w.current_area_id || ""] || "—";
                  const saved = !!todayLogs[w.id];
                  return (
                    <Card key={w.id} className={`p-2 space-y-2 ${saved ? "bg-emerald-500/5 border-emerald-500/30" : ""}`}>
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm">{w.name}</div>
                          <div className="text-[11px] text-muted-foreground">📍 {siteName}</div>
                        </div>
                        <div className="text-xs text-right shrink-0">
                          <div>Days: <b>{totalDays.toFixed(2)}</b></div>
                          {rate > 0 && <div>₹{totalRs.toFixed(0)}</div>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[11px] text-muted-foreground"><L k="days" oneLine /></div>
                          <Select value={r.wage} onValueChange={(v) => setR(w.id, { wage: v })}>
                            <SelectTrigger className="h-10"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>{[0,0.5,1,1.5,2,2.5,3].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground"><L k="hours" oneLine /></div>
                          <Select value={r.hours} onValueChange={(v) => setR(w.id, { hours: v })}>
                            <SelectTrigger className="h-10"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>{[0,1,2,3,4,5,6,7,8].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                      {(r.wage !== "" && r.hours !== "" && totalDays === 0) && (
                        <Textarea
                          rows={2} placeholder="Reason for 0 wage"
                          value={r.reason} onChange={(e) => setR(w.id, { reason: e.target.value })}
                        />
                      )}
                      <div className="flex justify-end">
                        <Button size="sm" disabled={saving === w.id} onClick={() => save(w)}>
                          {saving === w.id ? "…" : saved ? "Update" : <L k="save" oneLine />}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
