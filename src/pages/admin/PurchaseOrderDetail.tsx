// PO view document. Work Order is editable here (searchable dropdown).
// Internal `site` column is presented as Work Order; `area` as Site.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Download, Printer, MapPin } from "lucide-react";
import { format } from "date-fns";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { generatePoPdf } from "@/lib/poPdf";





type PO = {
  id: string; client_name: string; site: string; doc_date: string; po_number: string | null;
  client_id: string | null; site_id: string | null; area_id: string | null;
};

type Item = {
  id: string; description: string; uom: string; quantity: number;
  rate: number | null; area_id: string | null;
  amendment_serial: number; source_quotation_id: string | null;
};
type Quotation = { id: string; doc_date: string };

const serialStr = (n: number) => String(n).padStart(5, "0");

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const [po, setPo] = useState<PO | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [areas, setAreas] = useState<Record<string, string>>({});
  const [quotations, setQuotations] = useState<Record<string, Quotation>>({});
  const [assignedByLine, setAssignedByLine] = useState<Record<string, number>>({});
  const [siteSplits, setSiteSplits] = useState<Record<string, { areaId: string | null; areaName: string; qty: number; supName: string | null }[]>>({});





  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from("purchase_orders").select("*").eq("id", id!).single();
      setPo(p as any);



      const { data: it } = await supabase.from("po_line_items")
        .select("id,description,uom,quantity,area_id,amendment_serial,source_quotation_id")
        .eq("po_id", id!).order("amendment_serial").order("created_at");
      // rate not stored on po_line_items in this codebase; try quotation_items as fallback.
      const items = (it || []).map((x: any) => ({
        ...x,
        quantity: Number(x.quantity),
        rate: null as number | null,
        amendment_serial: Number(x.amendment_serial ?? 10),
      })) as Item[];

      // Fetch rates by joining via source_quotation_item_id
      const { data: rates } = await supabase.from("po_line_items")
        .select("id,source_quotation_item_id")
        .eq("po_id", id!);
      const qiIds = (rates || []).map((r: any) => r.source_quotation_item_id).filter(Boolean);
      if (qiIds.length) {
        const { data: qi } = await supabase.from("quotation_items").select("id,rate").in("id", qiIds);
        const rateMap = new Map<string, number>();
        (qi || []).forEach((q: any) => rateMap.set(q.id, Number(q.rate) || 0));
        const sqMap = new Map<string, string>();
        (rates || []).forEach((r: any) => { if (r.source_quotation_item_id) sqMap.set(r.id, r.source_quotation_item_id); });
        items.forEach((row) => {
          const qiId = sqMap.get(row.id);
          if (qiId) row.rate = rateMap.get(qiId) ?? null;
        });
      }
      setItems(items);

      // Fetch areas for display (internal "area" = external "Site")
      const { data: ar } = await supabase.from("areas").select("id,name");
      const am: Record<string, string> = {};
      (ar || []).forEach((a: any) => (am[a.id] = a.name));
      setAreas(am);

      // Fetch quotations for amendment labels
      const qIds = Array.from(new Set(items.map((x) => x.source_quotation_id).filter(Boolean))) as string[];
      if (qIds.length) {
        const { data: qs } = await supabase.from("quotations").select("id,doc_date").in("id", qIds);
        const qm: Record<string, Quotation> = {};
        (qs || []).forEach((q: any) => (qm[q.id] = q));
        setQuotations(qm);
      }

      // Assignment rollup: how much of each line item is already assigned (via site_assignment_items)
      const { data: sas } = await supabase.from("site_assignments").select("id,area_id").eq("po_id", id!);
      const saIds = (sas || []).map((s: any) => s.id);
      const saAreaMap = new Map<string, string | null>();
      (sas || []).forEach((s: any) => saAreaMap.set(s.id, s.area_id));
      const areaIds = Array.from(new Set((sas || []).map((s: any) => s.area_id).filter(Boolean)));
      let areaNameMap: Record<string, string> = {};
      if (areaIds.length) {
        const { data: ars2 } = await supabase.from("areas").select("id,name").in("id", areaIds as string[]);
        (ars2 || []).forEach((a: any) => (areaNameMap[a.id] = a.name));
      }
      // Primary supervisor per site_assignment
      const { data: saRows } = saIds.length
        ? await supabase.from("site_assignments").select("id,primary_supervisor_id").in("id", saIds)
        : { data: [] as any[] };
      const primaryBySa = new Map<string, string | null>();
      (saRows || []).forEach((r: any) => primaryBySa.set(r.id, r.primary_supervisor_id));
      const supIds = Array.from(new Set((saRows || []).map((r: any) => r.primary_supervisor_id).filter(Boolean)));
      let supMap: Record<string, string> = {};
      if (supIds.length) {
        const { data: ss } = await supabase.from("supervisors").select("id,name").in("id", supIds as string[]);
        (ss || []).forEach((s: any) => (supMap[s.id] = s.name));
      }
      if (saIds.length) {
        const { data: sai } = await supabase.from("site_assignment_items")
          .select("site_assignment_id,po_line_item_id,quantity").in("site_assignment_id", saIds);
        const totals: Record<string, number> = {};
        const splits: Record<string, { areaId: string | null; areaName: string; qty: number; supName: string | null }[]> = {};
        (sai || []).forEach((row: any) => {
          const q = Number(row.quantity) || 0;
          totals[row.po_line_item_id] = (totals[row.po_line_item_id] || 0) + q;
          const aId = saAreaMap.get(row.site_assignment_id) || null;
          const primId = primaryBySa.get(row.site_assignment_id) || null;
          (splits[row.po_line_item_id] ||= []).push({
            areaId: aId,
            areaName: (aId && areaNameMap[aId]) || "—",
            qty: q,
            supName: primId ? (supMap[primId] || null) : null,
          });
        });
        setAssignedByLine(totals);
        setSiteSplits(splits);
      }
    })();
  }, [id]);

  const grouped = useMemo(() => {
    const map = new Map<number, Item[]>();
    items.forEach((it) => {
      const k = it.amendment_serial ?? 10;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [items]);

  const grandTotal = useMemo(
    () => items.reduce((s, it) => s + (Number(it.rate || 0) * Number(it.quantity || 0)), 0),
    [items],
  );

  const rollup = useMemo(() => {
    const totalLines = items.length;
    let totalQty = 0, assignedQty = 0, fullyDone = 0, partial = 0;
    items.forEach((it) => {
      const t = Number(it.quantity) || 0;
      const a = Math.min(assignedByLine[it.id] || 0, t);
      totalQty += t;
      assignedQty += a;
      if (t > 0 && a >= t - 0.0001) fullyDone++;
      else if (a > 0) partial++;
    });
    const unassigned = totalLines - fullyDone - partial;
    const pct = totalQty > 0 ? Math.round((assignedQty / totalQty) * 100) : 0;
    return { totalLines, totalQty, assignedQty, fullyDone, partial, unassigned, pct };
  }, [items, assignedByLine]);


  if (!po) return <div className="text-muted-foreground">Loading…</div>;

  const areaName = (aid: string | null) => (aid ? areas[aid] : null);

  const onPdf = () => generatePoPdf(po, items, quotations, { autoSave: true });
  const onPrint = () => generatePoPdf(po, items, quotations, { print: true });

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap justify-between gap-2 items-start">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/admin/purchase-orders"><ArrowLeft className="h-4 w-4" /> Register</Link>
          </Button>
          <h2 className="text-xl font-semibold">Purchase Order</h2>
          <div className="text-sm text-muted-foreground">View-only document</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild><Link to={`/admin/purchase-orders/${id}/sites`}>Site assignments</Link></Button>
          <Button variant="outline" onClick={onPrint}><Printer className="h-4 w-4" />Print</Button>
          <Button onClick={onPdf}><Download className="h-4 w-4" />Download PDF</Button>
        </div>
      </div>

      <Card className="p-4 grid sm:grid-cols-2 gap-3 text-sm">
        <div><span className="text-muted-foreground">PO Number: </span><span className="font-semibold text-primary">{po.po_number || "(no #)"}</span></div>
        <div><span className="text-muted-foreground">Date: </span><span className="font-medium">{po.doc_date ? format(new Date(po.doc_date + "T00:00:00"), "PP") : ""}</span></div>
        <div><span className="text-muted-foreground">Client: </span><span className="font-medium">{po.client_name}</span></div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Work Order:</span>
          <span className="font-medium">{po.site || "—"}</span>
        </div>

      </Card>

      {/* Assignment status */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-sm">Assignment Status</h3>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/admin/purchase-orders/${id}/sites`}>Manage site assignments</Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded border p-2">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Line Items</div>
            <div className="text-lg font-semibold">{rollup.totalLines}</div>
            <div className="text-[11px] text-muted-foreground">
              <span className="text-emerald-600">{rollup.fullyDone} full</span> · <span className="text-amber-600">{rollup.partial} partial</span> · {rollup.unassigned} none
            </div>
          </div>
          <div className="rounded border p-2">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Qty</div>
            <div className="text-lg font-semibold">{rollup.totalQty.toLocaleString("en-IN")}</div>
            <div className="text-[11px] text-muted-foreground">across all lines</div>
          </div>
          <div className="rounded border p-2 col-span-2">
            <div className="flex items-baseline justify-between">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Assigned</div>
              <div className="text-sm font-semibold">{rollup.assignedQty.toLocaleString("en-IN")} / {rollup.totalQty.toLocaleString("en-IN")} <span className="text-muted-foreground">({rollup.pct}%)</span></div>
            </div>
            <Progress value={rollup.pct} className="h-2 mt-1" />
            <div className="text-[11px] text-muted-foreground mt-1">
              Remaining: {(rollup.totalQty - rollup.assignedQty).toLocaleString("en-IN")}
            </div>
          </div>
        </div>
      </Card>

      <h3 className="font-semibold pt-2">Line Items</h3>

      {grouped.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">No line items.</Card>}

      <div className="space-y-4">
        {grouped.map(([serial, rows], idx) => {
          const isOriginal = idx === 0;
          const srcQ = rows[0].source_quotation_id ? quotations[rows[0].source_quotation_id] : null;
          return (
            <Card key={serial} className="p-0 overflow-hidden">
              <div className="px-3 py-2 border-b bg-muted/40 flex items-center gap-2 flex-wrap">
                <Badge variant={isOriginal ? "default" : "secondary"}>
                  {isOriginal ? "Original" : "Amendment"} · {serialStr(serial)}
                </Badge>
                {srcQ && (
                  <span className="text-xs text-muted-foreground">Quotation {srcQ.doc_date || ""}</span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">{rows.length} item(s)</span>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>UoM</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="min-w-[180px]">Assigned</TableHead>
                      <TableHead className="text-right">Rate ₹</TableHead>
                      <TableHead className="text-right">Amount ₹</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((it, i) => {
                      const amount = Number(it.rate || 0) * Number(it.quantity);
                      const assigned = Math.min(assignedByLine[it.id] || 0, it.quantity);
                      const remaining = Math.max(0, it.quantity - assigned);
                      const p = it.quantity > 0 ? Math.round((assigned / it.quantity) * 100) : 0;
                      const rowBg = p >= 100 ? "bg-emerald-500/5" : p > 0 ? "bg-amber-500/5" : "";
                      const splits = siteSplits[it.id] || [];
                      return (
                        <TableRow key={it.id} className={rowBg}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell className="max-w-[320px]">
                            <div className="whitespace-normal break-words" title={it.description}>{it.description}</div>
                            {areaName(it.area_id) && <div className="text-xs text-muted-foreground">Site: {areaName(it.area_id)}</div>}
                            {splits.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {splits.map((s, ix) => (
                                  <span key={ix} className="inline-flex items-center gap-1 text-[11px] rounded bg-muted/50 px-1.5 py-0.5">
                                    <MapPin className="h-3 w-3" /> {s.areaName} · {s.qty}{s.supName ? ` · ${s.supName}` : ""}
                                  </span>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{it.uom}</TableCell>
                          <TableCell className="text-right">{it.quantity}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={p} className="h-1.5 flex-1 min-w-[60px]" />
                              <span className="text-xs whitespace-nowrap">{assigned}/{it.quantity}</span>
                            </div>
                            {remaining > 0 ? (
                              <div className="text-[11px] text-amber-700 mt-0.5">Remaining {remaining}</div>
                            ) : it.quantity > 0 ? (
                              <div className="text-[11px] text-emerald-700 mt-0.5">Fully assigned</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">{it.rate ? Number(it.rate).toFixed(2) : "—"}</TableCell>
                          <TableCell className="text-right">{amount ? amount.toFixed(2) : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          );
        })}
      </div>

      {grandTotal > 0 && (
        <Card className="p-3 flex justify-end text-base">
          <span>Grand Total: <span className="font-bold text-lg">₹{grandTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></span>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        To assign supervisors or view live progress, go to the <Link to="/admin/dashboard" className="underline">Dashboard</Link> or the <Link to="/admin/assignments" className="underline">Assignments register</Link>.
      </p>
    </div>
  );
}
