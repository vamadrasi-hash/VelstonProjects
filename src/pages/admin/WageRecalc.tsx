import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/SearchableSelect";
import { fmtINR, fmtDate, todayIso, splitWage } from "@/lib/format";
import { toast } from "sonner";

type Worker = { id: string; name: string; daily_rate: number; contractor_share_amount: number };
type LogRow = {
  id: string; worker_id: string; date: string; wage_scale: number;
  total_wages: number; contractor_share: number;
};
type Preview = LogRow & {
  worker_name: string; rate: number; new_share: number;
};

export default function WageRecalc() {
  const [params] = useSearchParams();
  const today = todayIso();
  const monthAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0,10); })();

  const [from, setFrom] = useState(params.get("from") || monthAgo);
  const [to, setTo] = useState(params.get("to") || today);
  const [workerId, setWorkerId] = useState(params.get("worker") || "");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("workers").select("id,name,daily_rate,contractor_share_amount").order("name")
      .then(({ data }) => setWorkers((data as any) || []));
  }, []);

  const workerOpts = useMemo(() => workers.map((w) => ({ value: w.id, label: w.name })), [workers]);
  const workerMap = useMemo(() => {
    const m: Record<string, Worker> = {};
    workers.forEach((w) => { m[w.id] = w; });
    return m;
  }, [workers]);

  const buildPreview = async () => {
    if (!from || !to) return toast.error("Pick date range");
    setBusy(true);
    let q = supabase.from("daily_logs")
      .select("id,worker_id,date,wage_scale,total_wages,contractor_share")
      .gte("date", from).lte("date", to);
    if (workerId) q = q.eq("worker_id", workerId);
    const { data, error } = await q;
    setBusy(false);
    if (error) return toast.error(error.message);
    const rows = (data as LogRow[]) || [];
    const out: Preview[] = [];
    for (const r of rows) {
      const w = workerMap[r.worker_id];
      if (!w) continue;
      const newShare = Number(w.contractor_share_amount || 0) * Number(r.total_wages || 0);
      if (Math.abs(newShare - Number(r.contractor_share || 0)) < 0.001) continue;
      out.push({ ...r, worker_name: w.name, rate: Number(w.daily_rate || 0), new_share: newShare });
    }
    setPreview(out);
    if (out.length === 0) toast.info("Nothing to recalculate in this range.");
  };

  const apply = async () => {
    if (!preview || preview.length === 0) return;
    if (!confirm(`Update ${preview.length} log row(s)?`)) return;
    setBusy(true);
    let ok = 0, fail = 0;
    for (const r of preview) {
      const { error } = await supabase.from("daily_logs")
        .update({ contractor_share: r.new_share }).eq("id", r.id);
      if (error) fail++; else ok++;
    }
    setBusy(false);
    if (fail) toast.error(`Updated ${ok}, failed ${fail}`);
    else toast.success(`Updated ${ok} row(s)`);
    setPreview(null);
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold">Recalculate Contractor Share</h2>
        <p className="text-sm text-muted-foreground">
          Rewrites <code>contractor_share</code> on past daily logs using each worker's current ₹/day share.
          Total wage is unchanged — only the worker/contractor split is updated.
        </p>
      </div>

      <Card className="p-3 space-y-3">
        <div className="grid sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">From</div>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">To</div>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Worker (leave blank for all workers)</div>
          <SearchableSelect value={workerId} onChange={setWorkerId} options={workerOpts}
            placeholder="All workers" allowClear />
        </div>
        <div className="flex gap-2">
          <Button onClick={buildPreview} disabled={busy} variant="outline">Preview</Button>
          <Button onClick={apply} disabled={busy || !preview || preview.length === 0}>
            Run Recalculate
          </Button>
        </div>
      </Card>

      {preview && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium">Preview</div>
            <Badge variant="outline">{preview.length} row(s) will change</Badge>
          </div>
          {preview.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground text-left">
                  <tr>
                    <th className="py-1 pr-2">Date</th>
                    <th className="py-1 pr-2">Worker</th>
                    <th className="py-1 pr-2">Scale</th>
                    <th className="py-1 pr-2">Total ₹</th>
                    <th className="py-1 pr-2">Old split (W · C)</th>
                    <th className="py-1 pr-2">New split (W · C)</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 100).map((r) => {
                    const oldS = splitWage(r.total_wages, r.rate, r.contractor_share);
                    const newS = splitWage(r.total_wages, r.rate, r.new_share);
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="py-1 pr-2">{fmtDate(r.date)}</td>
                        <td className="py-1 pr-2">{r.worker_name}</td>
                        <td className="py-1 pr-2">{r.wage_scale}</td>
                        <td className="py-1 pr-2">₹{fmtINR(oldS.total)}</td>
                        <td className="py-1 pr-2 text-muted-foreground">
                          ₹{fmtINR(oldS.worker)} · ₹{fmtINR(oldS.contractor)}
                        </td>
                        <td className="py-1 pr-2">
                          ₹{fmtINR(newS.worker)} · ₹{fmtINR(newS.contractor)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {preview.length > 100 && (
                <div className="text-xs text-muted-foreground pt-2">
                  Showing first 100 of {preview.length}.
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
