// Stage-1 site assignments for a PO.
// Group PO line items under a Site (areas table). Sites live under the PO's Work Order (sites table).
// A single line item may be split across multiple Sites.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AssignmentBadge } from "@/components/AssignmentBadge";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Pencil, UserPlus, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { useRole } from "@/lib/role";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PO = { id: string; client_name: string; site: string; client_id: string | null; site_id: string | null };
type Item = { id: string; description: string; uom: string; quantity: number; amendment_serial: number; source_quotation_id: string | null };
type QuotationInfo = { id: string; doc_date: string | null };
type Area = { id: string; name: string; site_id: string };
type LegacySite = { id: string; name: string };
type SA = { id: string; area_id: string | null; site_id: string | null; assignment_no: string | null; notes: string | null };
type SAItem = { id: string; site_assignment_id: string; po_line_item_id: string; quantity: number };

type Seat = { id: string; site_assignment_id: string; supervisor_id: string; assigned_date: string; assignment_no: string | null };

export default function PurchaseOrderSites() {
  const { id } = useParams();
  const { supervisors } = useRole();
  const [po, setPo] = useState<PO | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [legacySites, setLegacySites] = useState<Record<string, string>>({});
  const [sas, setSAs] = useState<SA[]>([]);
  const [saItems, setSAItems] = useState<SAItem[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [open, setOpen] = useState(false);
  const [newArea, setNewArea] = useState("");
  const [picks, setPicks] = useState<Record<string, string>>({}); // line_item_id -> qty
  const [rollupOpen, setRollupOpen] = useState(false);
  const [quotationMap, setQuotationMap] = useState<Record<string, QuotationInfo>>({});
  // Assign first supervisor dialog
  const [supDialogSa, setSupDialogSa] = useState<string | null>(null);
  const [supDialogSup, setSupDialogSup] = useState("");
  // Edit item qty
  const [editItem, setEditItem] = useState<{ row: SAItem; desc: string; uom: string; remaining: number } | null>(null);
  const [editItemQty, setEditItemQty] = useState("");
  // Edit SA site
  const [editSA, setEditSA] = useState<SA | null>(null);
  const [editSAArea, setEditSAArea] = useState("");
  // Confirm delete
  const [confirmDel, setConfirmDel] = useState<{ title: string; desc: string; onYes: () => Promise<unknown> } | null>(null);

  const load = async () => {
    const { data: p } = await supabase.from("purchase_orders").select("id,client_name,site,client_id,site_id").eq("id", id!).single();
    setPo(p as any);
    const [{ data: it }, { data: sa }] = await Promise.all([
      supabase.from("po_line_items").select("id,description,uom,quantity,amendment_serial,source_quotation_id").eq("po_id", id!).order("amendment_serial").order("created_at"),
      supabase.from("site_assignments").select("id,area_id,site_id,assignment_no,notes").eq("po_id", id!).order("created_at"),
    ]);
    const its = (it || []).map((x: any) => ({ ...x, quantity: Number(x.quantity), amendment_serial: Number(x.amendment_serial ?? 10) }));
    setItems(its);
    setSAs((sa || []) as any);
    // Load quotation info for quotation-wise breakdown
    const qIds = Array.from(new Set(its.map((x: any) => x.source_quotation_id).filter(Boolean))) as string[];
    if (qIds.length) {
      const { data: qs } = await supabase.from("quotations").select("id,doc_date").in("id", qIds);
      const qm: Record<string, QuotationInfo> = {};
      (qs || []).forEach((q: any) => (qm[q.id] = q));
      setQuotationMap(qm);
    } else {
      setQuotationMap({});
    }
    const saIds = (sa || []).map((x: any) => x.id);
    const [{ data: sai }, { data: la }] = await Promise.all([
      saIds.length
        ? supabase.from("site_assignment_items").select("*").in("site_assignment_id", saIds)
        : Promise.resolve({ data: [] as any[] } as any),
      saIds.length
        ? supabase.from("line_item_assignments").select("id,site_assignment_id,supervisor_id,assigned_date,assignment_no").in("site_assignment_id", saIds)
        : Promise.resolve({ data: [] as any[] } as any),
    ]);
    setSAItems(((sai || []) as any[]).map((x) => ({ ...x, quantity: Number(x.quantity) })));
    // Collapse per-line-item rows to one seat per (SA, supervisor)
    const seatMap = new Map<string, Seat>();
    ((la || []) as any[]).forEach((r) => {
      const k = `${r.site_assignment_id}|${r.supervisor_id}`;
      if (!seatMap.has(k)) seatMap.set(k, r as Seat);
    });
    setSeats(Array.from(seatMap.values()));

    // Areas = Sites under this PO's Work Order
    const woId = (p as any)?.site_id as string | null;
    if (woId) {
      const { data: ars } = await supabase.from("areas").select("id,name,site_id").eq("site_id", woId).order("name");
      setAreas((ars || []) as any);
    } else {
      setAreas([]);
    }
    // Legacy sites fallback (for old SAs that still reference sites.id)
    const legacyIds = ((sa as any[]) || []).map((x) => x.site_id).filter(Boolean);
    if (legacyIds.length) {
      const { data: ls } = await supabase.from("sites").select("id,name").in("id", legacyIds);
      const m: Record<string, string> = {};
      (ls || []).forEach((s: any) => (m[s.id] = s.name));
      setLegacySites(m);
    } else {
      setLegacySites({});
    }
  };
  useEffect(() => { load(); }, [id]);

  const seatsBySA = useMemo(() => {
    const m: Record<string, Seat[]> = {};
    seats.forEach((s) => { (m[s.site_assignment_id] ||= []).push(s); });
    return m;
  }, [seats]);
  const supName = (sid: string) => supervisors.find((s) => s.id === sid)?.name || "—";

  const assignFirstSupervisor = async () => {
    if (!supDialogSa || !supDialogSup) return toast.error("Pick a supervisor");
    const { error } = await supabase.rpc("add_supervisor_to_site" as any, {
      _site_assignment_id: supDialogSa,
      _supervisor_id: supDialogSup,
      _assigned_date: new Date().toISOString().slice(0, 10),
    });
    if (error) return toast.error(error.message);
    toast.success("Supervisor assigned");
    setSupDialogSa(null); setSupDialogSup("");
    load();
  };

  const areaName = (a: SA) =>
    (a.area_id && areas.find((x) => x.id === a.area_id)?.name) ||
    (a.site_id && legacySites[a.site_id]) ||
    "—";
  const usedFor = (lid: string) => saItems.filter((x) => x.po_line_item_id === lid).reduce((s, x) => s + x.quantity, 0);
  const remainingFor = (it: Item) => it.quantity - usedFor(it.id);

  const itemsBySA = useMemo(() => {
    const m: Record<string, SAItem[]> = {};
    saItems.forEach((x) => { (m[x.site_assignment_id] ||= []).push(x); });
    return m;
  }, [saItems]);

  const openDialog = () => {
    if (!po?.site_id) return toast.error("This PO has no Work Order. Set one first.");
    setNewArea("");
    const d: Record<string, string> = {};
    items.forEach((it) => { d[it.id] = ""; });
    setPicks(d);
    setOpen(true);
  };

  const createArea = async (name: string) => {
    if (!po?.site_id) { toast.error("Pick a Work Order first"); return null; }
    const { data, error } = await supabase.from("areas").insert({ site_id: po.site_id, name } as any).select("id,name,site_id").single();
    if (error || !data) { toast.error(error?.message || "Could not add site"); return null; }
    setAreas((p) => [...p, data as any]);
    return { value: (data as any).id, label: (data as any).name };
  };

  const save = async () => {
    if (!newArea) return toast.error("Pick a site");
    const rows = items
      .map((it) => ({ it, qty: Number(picks[it.id] || 0) }))
      .filter((r) => r.qty > 0);
    if (rows.length === 0) return toast.error("Enter a qty for at least one line");
    for (const r of rows) {
      if (r.qty > remainingFor(r.it) + 0.0001) {
        return toast.error(`${r.it.description}: qty exceeds remaining (${remainingFor(r.it)})`);
      }
    }
    // existing site assignment for this area? then add items to it
    let saId = sas.find((s) => s.area_id === newArea)?.id;
    if (!saId) {
      const { data, error } = await supabase
        .from("site_assignments").insert({ po_id: id!, area_id: newArea } as any).select("id").single();
      if (error || !data) return toast.error(error?.message || "Failed to create site assignment");
      saId = (data as any).id;
    }
    const payload = rows.map((r) => ({ site_assignment_id: saId!, po_line_item_id: r.it.id, quantity: r.qty }));
    const { error: ie } = await supabase.from("site_assignment_items").insert(payload as any);
    if (ie) return toast.error(ie.message);
    toast.success("Site assignment saved");
    setOpen(false);
    load();
  };

  const removeItem = (saiId: string) => {
    setConfirmDel({
      title: "Remove this line?",
      desc: "This removes the line item from this site assignment. Supervisor splits under it may become orphaned.",
      onYes: async () => {
        const { error } = await supabase.from("site_assignment_items").delete().eq("id", saiId);
        if (error) return toast.error(error.message);
        toast.success("Removed"); load();
      },
    });
  };

  const removeSA = (saId: string) => {
    setConfirmDel({
      title: "Delete this site assignment?",
      desc: "All line items grouped under this site will be removed. Supervisor assignments under it will be unlinked.",
      onYes: async () => {
        const { error } = await supabase.from("site_assignments").delete().eq("id", saId);
        if (error) return toast.error(error.message);
        toast.success("Deleted"); load();
      },
    });
  };

  const openEditItem = (r: SAItem) => {
    const it = items.find((i) => i.id === r.po_line_item_id); if (!it) return;
    const rem = remainingFor(it) + r.quantity; // remaining excluding this row
    setEditItem({ row: r, desc: it.description, uom: it.uom, remaining: rem });
    setEditItemQty(String(r.quantity));
  };
  const saveEditItem = async () => {
    if (!editItem) return;
    const q = Number(editItemQty);
    if (!(q > 0)) return toast.error("Qty must be > 0");
    if (q > editItem.remaining + 0.0001) return toast.error(`Max allowed: ${editItem.remaining}`);
    const { error } = await supabase.from("site_assignment_items").update({ quantity: q } as any).eq("id", editItem.row.id);
    if (error) return toast.error(error.message);
    toast.success("Updated"); setEditItem(null); load();
  };

  const openEditSA = (sa: SA) => {
    setEditSA(sa);
    setEditSAArea(sa.area_id || "");
  };
  const saveEditSA = async () => {
    if (!editSA) return;
    if (!editSAArea) return toast.error("Pick a site");
    const { error } = await supabase.from("site_assignments")
      .update({ area_id: editSAArea, site_id: null } as any).eq("id", editSA.id);
    if (error) return toast.error(error.message);
    toast.success("Updated"); setEditSA(null); load();
  };

  if (!po) return <div className="text-muted-foreground">Loading…</div>;

  // Overall rollup for header
  const rollup = (() => {
    let total = 0, assigned = 0, fullyDone = 0;
    items.forEach((it) => {
      const t = it.quantity;
      const a = Math.min(usedFor(it.id), t);
      total += t; assigned += a;
      if (t > 0 && a >= t - 0.0001) fullyDone++;
    });
    const p = total > 0 ? Math.round((assigned / total) * 100) : 0;
    return { total, assigned, fullyDone, p, lines: items.length };
  })();

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap justify-between gap-2 items-start">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
            <Link to={`/admin/purchase-orders/${id}`}><ArrowLeft className="h-4 w-4" /> Back to PO</Link>
          </Button>
          <h2 className="text-xl font-semibold">{po.client_name} — Site Assignments</h2>
          <div className="text-sm text-muted-foreground">Work Order: {po.site} · split line items across Sites</div>
        </div>
        <Button onClick={openDialog}><Plus className="h-4 w-4" /> Assign to a site</Button>
      </div>

      {/* Overall assignment status */}
      <Card className="p-3">
        <button
          type="button"
          onClick={() => setRollupOpen((v) => !v)}
          className="w-full text-left"
          aria-expanded={rollupOpen}
        >
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div className="text-sm font-semibold flex items-center gap-1">
              PO Assignment Status
              {rollupOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
            <div className="text-xs text-muted-foreground">
              {rollup.fullyDone}/{rollup.lines} lines fully assigned
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1">
              <div className="h-2 rounded bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${rollup.p}%` }} />
              </div>
            </div>
            <div className="text-sm font-semibold whitespace-nowrap">
              {rollup.assigned.toLocaleString("en-IN")} / {rollup.total.toLocaleString("en-IN")} <span className="text-muted-foreground font-normal">({rollup.p}%)</span>
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Remaining: {(rollup.total - rollup.assigned).toLocaleString("en-IN")} units · {rollupOpen ? "click to hide breakdown" : "click for quotation-wise breakdown"}
          </div>
        </button>
        {rollupOpen && (() => {
          // Group items by source_quotation_id (null = direct PO)
          const groups = new Map<string, Item[]>();
          items.forEach((it) => {
            const k = it.source_quotation_id || "__direct";
            (groups.get(k) || groups.set(k, []).get(k))!.push(it);
          });
          const entries = Array.from(groups.entries());
          return (
            <div className="mt-3 border-t pt-3 space-y-3">
              {entries.map(([qid, rows]) => {
                const q = qid !== "__direct" ? quotationMap[qid] : null;
                const label = q
                  ? `Quotation · ${q.doc_date || qid.slice(0, 6)}`
                  : "Direct (no quotation)";
                let gTotal = 0, gAssigned = 0, gFull = 0;
                rows.forEach((it) => {
                  const a = Math.min(usedFor(it.id), it.quantity);
                  gTotal += it.quantity; gAssigned += a;
                  if (it.quantity > 0 && a >= it.quantity - 0.0001) gFull++;
                });
                const gp = gTotal > 0 ? Math.round((gAssigned / gTotal) * 100) : 0;
                return (
                  <div key={qid} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-xs font-semibold">{label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {gFull}/{rows.length} lines · {gAssigned.toLocaleString("en-IN")}/{gTotal.toLocaleString("en-IN")} ({gp}%)
                      </div>
                    </div>
                    <div className="rounded border divide-y">
                      {rows.map((it) => {
                        const a = Math.min(usedFor(it.id), it.quantity);
                        const p = it.quantity > 0 ? Math.round((a / it.quantity) * 100) : 0;
                        const done = p >= 100;
                        return (
                          <div key={it.id} className="p-2 flex items-center gap-2 text-xs">
                            <div className="min-w-0 flex-1 truncate" title={it.description}>{it.description}</div>
                            <div className="w-24 h-1.5 rounded bg-muted overflow-hidden shrink-0">
                              <div className={`h-full ${done ? "bg-emerald-500" : p > 0 ? "bg-amber-500" : "bg-muted-foreground/30"}`} style={{ width: `${p}%` }} />
                            </div>
                            <div className="whitespace-nowrap shrink-0 tabular-nums">
                              {a}/{it.quantity} {it.uom}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Card>



      <div className="grid gap-3">
        {sas.map((sa) => {
          const rows = (itemsBySA[sa.id] || []);
          return (
            <Card key={sa.id} className="p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <AssignmentBadge no={sa.assignment_no} size="md" />
                <Badge variant="outline" className="max-w-full whitespace-normal break-words">📍 {areaName(sa)}</Badge>
                <span className="text-xs text-muted-foreground">{rows.length} item(s)</span>
                <div className="flex items-center gap-1 ml-auto">
                  <Button variant="ghost" size="icon" onClick={() => openEditSA(sa)} title="Edit site"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => removeSA(sa.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              {(() => {
                const sSeats = seatsBySA[sa.id] || [];
                if (sSeats.length === 0) {
                  return (
                    <div className="rounded border border-dashed p-2 flex flex-wrap items-center gap-2 bg-muted/20">
                      <span className="text-xs text-muted-foreground flex-1 min-w-0">No supervisor on this site yet.</span>
                      <Button size="sm" onClick={() => { setSupDialogSa(sa.id); setSupDialogSup(""); }}>
                        <UserPlus className="h-4 w-4 mr-1" /> Assign supervisor
                      </Button>
                    </div>
                  );
                }
                return (
                  <div className="rounded border p-2 space-y-1.5 bg-emerald-500/5 border-emerald-500/30">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs text-muted-foreground mr-1">Supervisors:</span>
                      {sSeats.map((s) => (
                        <Badge key={s.id} variant="secondary" className="text-xs">
                          👷 {supName(s.supervisor_id)}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">
                        Add / hand-over / release is managed from the Assignments Register.
                      </span>
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/admin/assignments">
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open Register
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })()}
              <div className="space-y-1">
                {rows.map((r) => {
                  const it = items.find((i) => i.id === r.po_line_item_id);
                  if (!it) return null;
                  return (
                    <div key={r.id} className="flex items-start justify-between gap-2 text-sm border-t pt-2">
                      <div className="min-w-0 flex-1 break-words">{it.description}</div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-muted-foreground whitespace-nowrap text-xs">{r.quantity} {it.uom}</span>
                        <Button variant="ghost" size="icon" onClick={() => openEditItem(r)} title="Edit qty"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => removeItem(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
        {sas.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No site assignments yet. Create one to start assigning supervisors.
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Assign line items to a site</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-sm mb-1">Site</div>
              <SearchableSelect
                value={newArea}
                onChange={setNewArea}
                options={areas.map((a) => ({ value: a.id, label: a.name }))}
                placeholder={po.site_id ? "Select or add site" : "PO has no Work Order"}
                disabled={!po.site_id}
                onCreate={po.site_id ? async (text) => createArea(text) : undefined}
              />
            </div>
            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {(() => {
                const groups = new Map<number, Item[]>();
                items.forEach((it) => {
                  const k = Number(it.amendment_serial ?? 10);
                  if (!groups.has(k)) groups.set(k, []);
                  groups.get(k)!.push(it);
                });
                const serials = Array.from(groups.keys()).sort((a, b) => a - b);
                return serials.map((serial, gi) => {
                  const isOriginal = gi === 0;
                  const group = groups.get(serial)!;
                  return (
                    <div key={serial} className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <Badge variant={isOriginal ? "default" : "secondary"}>
                          {isOriginal ? "Original" : "Amendment"} · {String(serial).padStart(5, "0")}
                        </Badge>
                      </div>
                      {group.map((it) => {
                        const rem = remainingFor(it);
                        return (
                          <div key={it.id} className="flex items-center gap-2 border rounded p-2 min-w-0">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm break-words">{it.description}</div>
                              <div className="text-xs text-muted-foreground">PO qty {it.quantity} {it.uom} · Remaining {rem}</div>
                            </div>
                            <Input
                              type="number" inputMode="decimal" className="w-20 shrink-0" placeholder="Qty"
                              value={picks[it.id] || ""}
                              onChange={(e) => setPicks((p) => ({ ...p, [it.id]: e.target.value }))}
                              disabled={rem <= 0}
                            />
                            <Button size="sm" variant="outline" className="shrink-0" disabled={rem <= 0}
                              onClick={() => setPicks((p) => ({ ...p, [it.id]: String(rem) }))}>All</Button>
                          </div>
                        );
                      })}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit item qty */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit line qty</DialogTitle></DialogHeader>
          {editItem && (
            <div className="space-y-2">
              <div className="text-sm">{editItem.desc}</div>
              <div className="text-xs text-muted-foreground">Max allowed: {editItem.remaining} {editItem.uom}</div>
              <Input type="number" inputMode="decimal" value={editItemQty} onChange={(e) => setEditItemQty(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={saveEditItem}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit SA site */}
      <Dialog open={!!editSA} onOpenChange={(o) => !o && setEditSA(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change site</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="text-sm">Site</div>
            <SearchableSelect
              value={editSAArea}
              onChange={setEditSAArea}
              options={areas.map((a) => ({ value: a.id, label: a.name }))}
              placeholder={po.site_id ? "Select or add site" : "PO has no Work Order"}
              disabled={!po.site_id}
              onCreate={po.site_id ? async (text) => createArea(text) : undefined}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSA(null)}>Cancel</Button>
            <Button onClick={saveEditSA}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDel?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDel?.desc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { const fn = confirmDel?.onYes; setConfirmDel(null); if (fn) await fn(); }}>
              Yes, delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign first supervisor to a site */}
      <Dialog open={!!supDialogSa} onOpenChange={(o) => { if (!o) { setSupDialogSa(null); setSupDialogSup(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign supervisor to site</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Any further change (add another supervisor, hand-over, release) happens in the Assignments Register.
            </p>
            <div>
              <div className="text-xs mb-1 text-muted-foreground">Supervisor</div>
              <Select value={supDialogSup} onValueChange={setSupDialogSup}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Pick supervisor" /></SelectTrigger>
                <SelectContent>
                  {supervisors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupDialogSa(null)}>Cancel</Button>
            <Button onClick={assignFirstSupervisor}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
