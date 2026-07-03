// PO Register — one-line-per-PO list with View + Delete. Status/progress lives on the Dashboard.
// External terminology: "Site" (in `po.site`) is presented as Work Order.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";

type PO = { id: string; client_name: string; site: string; doc_date: string; po_number: string | null };
type Roll = { total: number; assigned: number; pct: number };

export default function PurchaseOrders() {
  const [list, setList] = useState<PO[]>([]);
  const [rolls, setRolls] = useState<Record<string, Roll>>({});
  const load = async () => {
    const { data } = await supabase.from("purchase_orders").select("id,client_name,site,doc_date,po_number")
      .order("doc_date", { ascending: false });
    setList((data as any) || []);
    const poIds = ((data as any) || []).map((p: any) => p.id);
    if (!poIds.length) { setRolls({}); return; }
    const [{ data: li }, { data: sas }] = await Promise.all([
      supabase.from("po_line_items").select("id,po_id,quantity").in("po_id", poIds),
      supabase.from("site_assignments").select("id,po_id").in("po_id", poIds),
    ]);
    const saToPo = new Map<string, string>();
    (sas || []).forEach((s: any) => saToPo.set(s.id, s.po_id));
    const saIds = (sas || []).map((s: any) => s.id);
    const { data: sai } = saIds.length
      ? await supabase.from("site_assignment_items").select("site_assignment_id,po_line_item_id,quantity").in("site_assignment_id", saIds)
      : { data: [] as any[] };
    const lineToPo = new Map<string, string>();
    const totals: Record<string, number> = {};
    (li || []).forEach((r: any) => {
      lineToPo.set(r.id, r.po_id);
      totals[r.po_id] = (totals[r.po_id] || 0) + (Number(r.quantity) || 0);
    });
    const perLine: Record<string, number> = {};
    const lineQty = new Map<string, number>();
    (li || []).forEach((r: any) => lineQty.set(r.id, Number(r.quantity) || 0));
    (sai || []).forEach((r: any) => {
      perLine[r.po_line_item_id] = (perLine[r.po_line_item_id] || 0) + (Number(r.quantity) || 0);
    });
    const assigned: Record<string, number> = {};
    Object.entries(perLine).forEach(([lid, q]) => {
      const cap = lineQty.get(lid) || 0;
      const poId = lineToPo.get(lid);
      if (!poId) return;
      assigned[poId] = (assigned[poId] || 0) + Math.min(q, cap);
    });
    const rr: Record<string, Roll> = {};
    poIds.forEach((pid: string) => {
      const t = totals[pid] || 0;
      const a = assigned[pid] || 0;
      rr[pid] = { total: t, assigned: a, pct: t > 0 ? Math.round((a / t) * 100) : 0 };
    });
    setRolls(rr);
  };
  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    const { data: items } = await supabase.from("po_line_items").select("id").eq("po_id", id);
    const ids = (items || []).map((i) => i.id);
    if (ids.length) await supabase.from("line_item_assignments").delete().in("line_item_id", ids);
    await supabase.from("po_line_items").delete().eq("po_id", id);
    const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <h2 className="text-xl font-semibold">
        Purchase Order Register{" "}
        <span className="text-sm text-muted-foreground font-normal">({list.length})</span>
      </h2>

      {/* Mobile card list */}
      <div className="space-y-2 md:hidden">
        {list.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground text-sm">No POs yet. Convert a quotation to create one.</Card>
        ) : list.map((p) => (
          <Card key={p.id} className="p-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm">
                  {p.po_number ? <span className="text-primary">{p.po_number}</span> : <span className="text-muted-foreground text-xs">(no PO #)</span>}
                  <span className="text-xs text-muted-foreground ml-2">{p.doc_date ? format(new Date(p.doc_date + "T00:00:00"), "PP") : ""}</span>
                </div>
                <div className="text-sm break-words">{p.client_name}</div>
                <div className="text-xs text-muted-foreground break-words">📍 {p.site}</div>
                {rolls[p.id] && rolls[p.id].total > 0 && (
                  <div className="mt-1">
                    <div className="flex items-center gap-2 text-[11px]">
                      <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden">
                        <div className={`h-full ${rolls[p.id].pct >= 100 ? "bg-emerald-500" : rolls[p.id].pct > 0 ? "bg-amber-500" : "bg-muted-foreground/30"}`} style={{ width: `${rolls[p.id].pct}%` }} />
                      </div>
                      <span className="whitespace-nowrap">{rolls[p.id].assigned}/{rolls[p.id].total} ({rolls[p.id].pct}%)</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button asChild size="sm" variant="outline">
                  <Link to={`/admin/purchase-orders/${p.id}`}><Eye className="h-4 w-4" /></Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete PO?</AlertDialogTitle>
                      <AlertDialogDescription>Removes line items and all supervisor assignments.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(p.id)}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="p-0 overflow-x-auto hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO #</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Work Order</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="min-w-[180px]">Assigned</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  No POs yet. Convert a quotation to create one.
                </TableCell>
              </TableRow>
            ) : list.map((p) => {
              const r = rolls[p.id];
              return (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.po_number ? <span className="text-primary">{p.po_number}</span> : <span className="text-muted-foreground text-xs">(no #)</span>}
                </TableCell>
                <TableCell className="max-w-[220px] truncate" title={p.client_name}>{p.client_name}</TableCell>
                <TableCell className="max-w-[220px] truncate" title={p.site}>{p.site}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {p.doc_date ? format(new Date(p.doc_date + "T00:00:00"), "PP") : ""}
                </TableCell>
                <TableCell>
                  {r && r.total > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden min-w-[60px]">
                        <div className={`h-full ${r.pct >= 100 ? "bg-emerald-500" : r.pct > 0 ? "bg-amber-500" : "bg-muted-foreground/30"}`} style={{ width: `${r.pct}%` }} />
                      </div>
                      <span className="text-xs whitespace-nowrap">{r.assigned}/{r.total} <span className="text-muted-foreground">({r.pct}%)</span></span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/admin/purchase-orders/${p.id}`}>
                        <Eye className="h-4 w-4" /> View
                      </Link>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete PO?</AlertDialogTitle>
                          <AlertDialogDescription>Removes line items and all supervisor assignments.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(p.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <p className="text-xs text-muted-foreground">
        Live PO status, progress, and supervisor activity are on the <Link to="/admin/dashboard" className="underline">Dashboard</Link>.
      </p>
    </div>
  );
}
