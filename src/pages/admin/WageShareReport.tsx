import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Download } from "lucide-react";

type Log = {
  id: string; date: string; worker_id: string | null; contractor_id: string | null;
  wage_scale: number; total_wages: number; contractor_share: number;
};
type Worker = { id: string; name: string; designation: string; daily_rate: number };

const today = () => new Date().toISOString().slice(0, 10);

export default function WageShareReport() {
  const [range, setRange] = useState<{ from?: string; to?: string }>({ from: today(), to: today() });
  const [contractorFilter, setContractorFilter] = useState<string>("all");
  const [logs, setLogs] = useState<Log[]>([]);
  const [workers, setWorkers] = useState<Record<string, Worker>>({});
  const [contractors, setContractors] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [{ data: ws }, { data: cs }] = await Promise.all([
        supabase.from("workers").select("id,name,designation,daily_rate"),
        supabase.from("contractors").select("id,name"),
      ]);
      const wm: Record<string, Worker> = {};
      (ws || []).forEach((w: any) => (wm[w.id] = { ...w, daily_rate: Number(w.daily_rate) || 0 }));
      setWorkers(wm);
      const cm: Record<string, string> = {};
      (cs || []).forEach((c: any) => (cm[c.id] = c.name));
      setContractors(cm);
    })();
  }, []);

  useEffect(() => {
    const from = range.from || today();
    const to = range.to || from;
    let q = supabase.from("daily_logs")
      .select("id,date,worker_id,contractor_id,wage_scale,total_wages,contractor_share")
      .gte("date", from).lte("date", to);
    if (contractorFilter !== "all") q = q.eq("contractor_id", contractorFilter);
    q.then(({ data }) => {
      setLogs((data || []).map((x: any) => ({
        ...x,
        wage_scale: Number(x.wage_scale),
        total_wages: Number(x.total_wages),
        contractor_share: Number(x.contractor_share || 0),
      })));
    });
  }, [range.from, range.to, contractorFilter]);

  type WorkerRow = {
    worker_id: string; name: string; designation: string;
    days: number; workerRs: number; contractorRs: number; totalRs: number;
  };
  type CRow = {
    contractor_id: string; name: string;
    workers: Map<string, WorkerRow>;
    workerRs: number; contractorRs: number; totalRs: number; days: number;
  };

  const grouped = useMemo(() => {
    const m = new Map<string, CRow>();
    for (const l of logs) {
      const cid = l.contractor_id || "—";
      let c = m.get(cid);
      if (!c) {
        c = { contractor_id: cid, name: contractors[cid] || "— No contractor",
              workers: new Map(), workerRs: 0, contractorRs: 0, totalRs: 0, days: 0 };
        m.set(cid, c);
      }
      const rate = workers[l.worker_id || ""]?.daily_rate || 0;
      const total = l.total_wages * rate;
      const contractor = Math.min(l.contractor_share, total);
      const worker = total - contractor;
      const wid = l.worker_id || "—";
      let wr = c.workers.get(wid);
      if (!wr) {
        const w = workers[wid];
        wr = { worker_id: wid, name: w?.name || "—", designation: w?.designation || "—",
               days: 0, workerRs: 0, contractorRs: 0, totalRs: 0 };
        c.workers.set(wid, wr);
      }
      wr.days += l.total_wages;
      wr.workerRs += worker;
      wr.contractorRs += contractor;
      wr.totalRs += total;
      c.days += l.total_wages;
      c.workerRs += worker;
      c.contractorRs += contractor;
      c.totalRs += total;
    }
    return Array.from(m.values()).sort((a, b) => b.contractorRs - a.contractorRs);
  }, [logs, workers, contractors]);

  const grand = useMemo(() => {
    return grouped.reduce(
      (s, c) => ({
        workerRs: s.workerRs + c.workerRs,
        contractorRs: s.contractorRs + c.contractorRs,
        totalRs: s.totalRs + c.totalRs,
        days: s.days + c.days,
      }),
      { workerRs: 0, contractorRs: 0, totalRs: 0, days: 0 },
    );
  }, [grouped]);

  const exportCsv = () => {
    const rows: string[][] = [
      ["Contractor", "Worker", "Designation", "Wages", "Worker ₹", "Contractor ₹", "Total ₹"],
    ];
    for (const c of grouped) {
      for (const w of c.workers.values()) {
        rows.push([
          c.name, w.name, w.designation,
          w.days.toFixed(2), w.workerRs.toFixed(2), w.contractorRs.toFixed(2), w.totalRs.toFixed(2),
        ]);
      }
      rows.push([c.name + " — TOTAL", "", "",
        c.days.toFixed(2), c.workerRs.toFixed(2), c.contractorRs.toFixed(2), c.totalRs.toFixed(2)]);
    }
    rows.push(["GRAND TOTAL", "", "",
      grand.days.toFixed(2), grand.workerRs.toFixed(2), grand.contractorRs.toFixed(2), grand.totalRs.toFixed(2)]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wage-share_${range.from || ""}_${range.to || ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 max-w-6xl">
      <h2 className="text-xl font-semibold">Wage Share Report</h2>
      <Card className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Date range</div>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
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
        <Button onClick={exportCsv} variant="outline" className="w-full md:w-auto">
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </Card>

      <Card className="p-3 flex flex-wrap gap-2 text-sm">
        <Badge variant="secondary">Wages: {grand.days.toFixed(2)}</Badge>
        <Badge variant="secondary">Worker ₹: {grand.workerRs.toFixed(0)}</Badge>
        <Badge variant="secondary">Contractor ₹: {grand.contractorRs.toFixed(0)}</Badge>
        <Badge>Total ₹: {grand.totalRs.toFixed(0)}</Badge>
      </Card>

      {grouped.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">No entries in this date range.</Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {grouped.map((c) => (
            <AccordionItem key={c.contractor_id} value={c.contractor_id} className="border rounded-md bg-card">
              <AccordionTrigger className="px-3 py-2 hover:no-underline">
                <div className="flex justify-between gap-2 w-full pr-2 text-left min-w-0">
                  <span className="font-semibold truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {c.days.toFixed(2)}w · Workers ₹{c.workerRs.toFixed(0)} · <b className="text-foreground">{c.name}: ₹{c.contractorRs.toFixed(0)}</b> · Total ₹{c.totalRs.toFixed(0)}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Worker</TableHead>
                      <TableHead className="text-right">Wages</TableHead>
                      <TableHead className="text-right">Worker ₹</TableHead>
                      <TableHead className="text-right">Contractor ₹</TableHead>
                      <TableHead className="text-right">Total ₹</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from(c.workers.values())
                      .sort((a, b) => b.contractorRs - a.contractorRs)
                      .map((w) => (
                        <TableRow key={w.worker_id}>
                          <TableCell>
                            <div className="font-medium">{w.name}</div>
                            <div className="text-xs text-muted-foreground">{w.designation}</div>
                          </TableCell>
                          <TableCell className="text-right">{w.days.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{w.workerRs.toFixed(0)}</TableCell>
                          <TableCell className="text-right font-medium">{w.contractorRs.toFixed(0)}</TableCell>
                          <TableCell className="text-right">{w.totalRs.toFixed(0)}</TableCell>
                        </TableRow>
                      ))}
                    <TableRow className="font-semibold bg-muted/30">
                      <TableCell>Subtotal</TableCell>
                      <TableCell className="text-right">{c.days.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{c.workerRs.toFixed(0)}</TableCell>
                      <TableCell className="text-right">{c.contractorRs.toFixed(0)}</TableCell>
                      <TableCell className="text-right">{c.totalRs.toFixed(0)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
