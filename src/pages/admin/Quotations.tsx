import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { format } from "date-fns";

type Quotation = {
  id: string; client_name: string; site: string; status: string;
  doc_date: string; merged_po_id?: string | null;
  quotation_no?: string | null;
};
type PoRef = { id: string; po_number: string | null };

export default function Quotations() {
  const [list, setList] = useState<Quotation[]>([]);
  const [poMap, setPoMap] = useState<Record<string, PoRef[]>>({});

  const load = async () => {
    const { data } = await supabase.from("quotations").select("*").order("doc_date", { ascending: false });
    const qs = (data as any) || [];
    setList(qs);

    const convertedIds = qs.filter((q: Quotation) => q.status === "converted").map((q: Quotation) => q.id);
    const mergedTargetIds = Array.from(new Set(qs.map((q: Quotation) => q.merged_po_id).filter(Boolean))) as string[];

    const map: Record<string, PoRef[]> = {};
    if (convertedIds.length) {
      const { data: pos } = await supabase
        .from("purchase_orders")
        .select("id,po_number,quotation_id")
        .in("quotation_id", convertedIds);
      (pos || []).forEach((p: any) => {
        if (!p.quotation_id) return;
        if (!map[p.quotation_id]) map[p.quotation_id] = [];
        map[p.quotation_id].push({ id: p.id, po_number: p.po_number });
      });
    }
    if (mergedTargetIds.length) {
      const { data: pos } = await supabase
        .from("purchase_orders")
        .select("id,po_number")
        .in("id", mergedTargetIds);
      const byId = new Map<string, PoRef>();
      (pos || []).forEach((p: any) => byId.set(p.id, { id: p.id, po_number: p.po_number }));
      qs.forEach((q: Quotation) => {
        if (q.merged_po_id && byId.has(q.merged_po_id)) {
          if (!map[q.id]) map[q.id] = [];
          map[q.id].push(byId.get(q.merged_po_id)!);
        }
      });
    }
    setPoMap(map);
  };
  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    await supabase.from("quotation_items").delete().eq("quotation_id", id);
    const { error } = await supabase.from("quotations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const renderCard = (q: Quotation) => {
    const pos = poMap[q.id] || [];
    return (
      <Card key={q.id} className="p-3 flex items-center justify-between gap-2 hover:border-primary transition min-h-[72px]">
        <Link to={`/admin/quotations/${q.id}`} className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold leading-tight truncate">
              {q.quotation_no || <span className="text-muted-foreground italic">no number</span>}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="truncate">{q.client_name}</span>
          </div>
          <div className="text-sm text-muted-foreground truncate">
            {q.site} · {q.doc_date ? format(new Date(q.doc_date + "T00:00:00"), "PP") : ""}
          </div>
          {pos.length > 0 && (
            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
              <span>PO:</span>
              {pos.map((p, i) => (
                <span key={p.id}>
                  <Link
                    to={`/admin/purchase-orders/${p.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-primary underline underline-offset-2 hover:opacity-80"
                  >
                    {p.po_number || "(no #)"}
                  </Link>
                  {i < pos.length - 1 ? "," : ""}
                </span>
              ))}
            </div>
          )}
        </Link>
        <div className="flex items-center gap-1 shrink-0">
          <Badge variant={q.status === "converted" ? "default" : q.status === "merged" ? "secondary" : "outline"}>{q.status}</Badge>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete quotation?</AlertDialogTitle>
                <AlertDialogDescription>This removes its line items too. Linked PO is unaffected.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove(q.id)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Card>
    );
  };

  const active = list.filter((q) => q.status !== "converted" && q.status !== "merged");
  const archived = list.filter((q) => q.status === "converted" || q.status === "merged");

  // Group archived quotations by PO (converted → their own PO; merged → merged_po_id)
  const groups = new Map<string, { po: PoRef; quotations: Quotation[] }>();
  const orphan: Quotation[] = [];
  archived.forEach((q) => {
    let po: PoRef | null = null;
    if (q.status === "converted") po = (poMap[q.id] || [])[0] || null;
    else if (q.merged_po_id) po = (poMap[q.id] || []).find((p) => p.id === q.merged_po_id) || null;
    if (!po) { orphan.push(q); return; }
    if (!groups.has(po.id)) groups.set(po.id, { po, quotations: [] });
    groups.get(po.id)!.quotations.push(q);
  });
  // Sort: converted (parent) first, then merged within each group
  groups.forEach((g) => g.quotations.sort((a, b) => (a.status === "converted" ? -1 : 1) - (b.status === "converted" ? -1 : 1)));
  const groupList = Array.from(groups.values()).sort((a, b) =>
    (b.quotations[0]?.doc_date || "").localeCompare(a.quotations[0]?.doc_date || "")
  );

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Quotations <span className="text-sm text-muted-foreground font-normal">({list.length})</span></h2>
        <Button asChild>
          <Link to="/admin/quotations/new"><Plus className="h-4 w-4" /><span className="hidden sm:inline">New Quotation</span><span className="sm:hidden">New</span></Link>
        </Button>
      </div>

      <div className="grid gap-2">
        {active.map(renderCard)}
        {active.length === 0 && archived.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground text-sm">No quotations yet.</Card>
        )}
      </div>

      {archived.length > 0 && (
        <Accordion type="single" collapsible>
          <AccordionItem value="archived" className="border rounded-md bg-card">
            <AccordionTrigger className="px-3 py-2 hover:no-underline">
              <span className="flex items-center gap-2 text-sm font-medium">
                Converted &amp; merged quotations
                <Badge variant="secondary">{archived.length}</Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-3 p-2 pt-0">
                {groupList.map(({ po, quotations }, idx) => {
                  const palette = [
                    { bar: "bg-sky-500", tint: "bg-sky-50 border-sky-200", chip: "bg-sky-100 text-sky-800 border-sky-200" },
                    { bar: "bg-emerald-500", tint: "bg-emerald-50 border-emerald-200", chip: "bg-emerald-100 text-emerald-800 border-emerald-200" },
                    { bar: "bg-amber-500", tint: "bg-amber-50 border-amber-200", chip: "bg-amber-100 text-amber-800 border-amber-200" },
                    { bar: "bg-violet-500", tint: "bg-violet-50 border-violet-200", chip: "bg-violet-100 text-violet-800 border-violet-200" },
                    { bar: "bg-rose-500", tint: "bg-rose-50 border-rose-200", chip: "bg-rose-100 text-rose-800 border-rose-200" },
                    { bar: "bg-teal-500", tint: "bg-teal-50 border-teal-200", chip: "bg-teal-100 text-teal-800 border-teal-200" },
                    { bar: "bg-indigo-500", tint: "bg-indigo-50 border-indigo-200", chip: "bg-indigo-100 text-indigo-800 border-indigo-200" },
                    { bar: "bg-fuchsia-500", tint: "bg-fuchsia-50 border-fuchsia-200", chip: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200" },
                    { bar: "bg-orange-500", tint: "bg-orange-50 border-orange-200", chip: "bg-orange-100 text-orange-800 border-orange-200" },
                    { bar: "bg-lime-500", tint: "bg-lime-50 border-lime-200", chip: "bg-lime-100 text-lime-800 border-lime-200" },
                    { bar: "bg-cyan-500", tint: "bg-cyan-50 border-cyan-200", chip: "bg-cyan-100 text-cyan-800 border-cyan-200" },
                    { bar: "bg-pink-500", tint: "bg-pink-50 border-pink-200", chip: "bg-pink-100 text-pink-800 border-pink-200" },
                  ];
                  const c = palette[idx % palette.length];
                  return (
                    <div key={po.id} className={`relative rounded-md border p-2 pl-3 space-y-2 ${c.tint}`}>
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-md ${c.bar}`} />
                      <div className="flex items-center gap-2 px-1 text-xs">
                        <span className="font-medium text-muted-foreground">PO</span>
                        <Link to={`/admin/purchase-orders/${po.id}`} className="text-primary underline underline-offset-2 font-medium">
                          {po.po_number || "(no #)"}
                        </Link>
                        <Badge variant="outline" className={`ml-auto ${c.chip}`}>{quotations.length} quotation{quotations.length > 1 ? "s" : ""}</Badge>
                      </div>
                      <div className="grid gap-2">{quotations.map(renderCard)}</div>
                    </div>
                  );
                })}
                {orphan.length > 0 && (
                  <div className="rounded-md border bg-muted/40 p-2 space-y-2">
                    <div className="px-1 text-xs text-muted-foreground font-medium">Unlinked</div>
                    <div className="grid gap-2">{orphan.map(renderCard)}</div>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
