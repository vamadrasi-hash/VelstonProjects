// Admin attendance report: per-worker IN/OUT and hours for a chosen day.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/DatePicker";
import { EmployeePhoto } from "@/components/EmployeePhoto";
import { Download, ScanFace } from "lucide-react";
import { downloadXlsx } from "@/lib/xlsx";
import { toast } from "sonner";

type Worker = { id: string; name: string; designation: string; photo_url: string | null };
type Event = {
  id: string; worker_id: string; kind: "in" | "out"; method: string;
  captured_at: string; supervisor_id: string | null;
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export default function Attendance() {
  const [date, setDate] = useState(todayStr());
  const [events, setEvents] = useState<Event[]>([]);
  const [workers, setWorkers] = useState<Record<string, Worker>>({});
  const [sups, setSups] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: ev }, { data: ws }, { data: ss }] = await Promise.all([
        supabase.from("attendance_events")
          .select("id,worker_id,kind,method,captured_at,supervisor_id")
          .eq("work_date", date)
          .order("captured_at", { ascending: true }),
        supabase.from("workers").select("id,name,designation,photo_url"),
        supabase.from("supervisors").select("id,name"),
      ]);
      setEvents((ev as any) || []);
      const wm: Record<string, Worker> = {}; ((ws as any[]) || []).forEach((w) => (wm[w.id] = w)); setWorkers(wm);
      const sm: Record<string, string> = {}; ((ss as any[]) || []).forEach((s) => (sm[s.id] = s.name)); setSups(sm);
    })();
  }, [date]);

  // Per-worker: first IN, last OUT, computed hours.
  const rows = useMemo(() => {
    const byWorker = new Map<string, Event[]>();
    events.forEach((e) => byWorker.set(e.worker_id, [...(byWorker.get(e.worker_id) || []), e]));
    const out = Array.from(byWorker.entries()).map(([workerId, evs]) => {
      const ins = evs.filter((e) => e.kind === "in");
      const outs = evs.filter((e) => e.kind === "out");
      const firstIn = ins[0]?.captured_at || null;
      const lastOut = outs.length ? outs[outs.length - 1].captured_at : null;
      let hours: number | null = null;
      if (firstIn && lastOut) {
        hours = (new Date(lastOut).getTime() - new Date(firstIn).getTime()) / 3.6e6;
        if (hours < 0) hours = null;
      }
      return {
        workerId,
        worker: workers[workerId],
        firstIn, lastOut, hours,
        status: (lastOut && outs.length >= ins.length ? "out" : "in") as "in" | "out",
        supName: sups[evs[0].supervisor_id || ""] || "—",
        count: evs.length,
      };
    });
    const q = search.trim().toLowerCase();
    return out
      .filter((r) => !q || (r.worker?.name || "").toLowerCase().includes(q))
      .sort((a, b) => (a.firstIn || "").localeCompare(b.firstIn || ""));
  }, [events, workers, sups, search]);

  const present = rows.length;
  const stillIn = rows.filter((r) => r.status === "in").length;

  const exportXlsx = () => {
    if (!rows.length) { toast.warning("Nothing to export"); return; }
    const data = rows.map((r) => ({
      worker: r.worker?.name || "—",
      designation: r.worker?.designation || "",
      first_in: r.firstIn ? hhmm(r.firstIn) : "",
      last_out: r.lastOut ? hhmm(r.lastOut) : "",
      hours: r.hours != null ? r.hours.toFixed(2) : "",
      supervisor: r.supName,
    }));
    try {
      downloadXlsx(`attendance-${date}.xlsx`, data, "Attendance");
      toast.success(`Downloaded attendance-${date}.xlsx`);
    } catch (e: any) { toast.error(e?.message || "Export failed"); }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <ScanFace className="h-5 w-5" /> Attendance
        </h2>
        <Button variant="outline" size="sm" onClick={exportXlsx}><Download className="h-4 w-4" /> Export</Button>
      </div>

      <Card className="p-3 grid sm:grid-cols-3 gap-2 items-center">
        <DatePicker value={date} onChange={setDate} />
        <Input placeholder="Search worker…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex gap-2 justify-end">
          <Badge variant="outline" className="text-emerald-600 border-emerald-500/40">Present {present}</Badge>
          <Badge variant="outline" className="text-amber-600 border-amber-500/40">Still in {stillIn}</Badge>
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">No attendance for this day.</Card>
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => (
            <Card key={r.workerId} className="p-3 flex items-center gap-3">
              <EmployeePhoto path={r.worker?.photo_url} name={r.worker?.name || "—"} size={44} />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{r.worker?.name || "Unknown"}</div>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                  <span>{r.worker?.designation}</span>
                  <span>· {r.supName}</span>
                  {r.count > 2 && <span>· {r.count} scans</span>}
                </div>
              </div>
              <div className="text-right text-xs whitespace-nowrap">
                <div className="flex items-center gap-1 justify-end">
                  <Badge variant="outline" className="text-emerald-600 border-emerald-500/40">IN {r.firstIn ? hhmm(r.firstIn) : "—"}</Badge>
                  <Badge variant="outline" className="text-orange-600 border-orange-500/40">OUT {r.lastOut ? hhmm(r.lastOut) : "—"}</Badge>
                </div>
                {r.hours != null && <div className="text-muted-foreground mt-1">{r.hours.toFixed(1)} h</div>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
