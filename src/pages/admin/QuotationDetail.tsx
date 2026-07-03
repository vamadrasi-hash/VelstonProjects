import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, RefreshCw, GitMerge } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useMaster, createMaster, toOptions, useInvalidateMaster } from "@/lib/masters";
import { DatePicker } from "@/components/DatePicker";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";

// External terminology: internal `sites` table = "Work Orders"; internal `areas` table = "Sites".

type Item = {
  id?: string; description: string; uom: string;
  quantity: string; rate: string;
  item_id?: string;
};

export default function QuotationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === "new";

  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [siteId, setSiteId] = useState("");        // work-order id (internal name `site`)
  const [siteName, setSiteName] = useState("");
  const [status, setStatus] = useState("draft");
  const [mergedPoId, setMergedPoId] = useState<string | null>(null);
  const [amendmentSerial, setAmendmentSerial] = useState<number | null>(null);
  const [docDate, setDocDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [quotationNo, setQuotationNo] = useState<string>("");
  const [items, setItems] = useState<Item[]>([{ description: "", uom: "nos", quantity: "", rate: "" }]);
  const [loading, setLoading] = useState(false);


  const { data: clients = [] } = useMaster<{ id: string; name: string }>("clients", "id,name");
  const { data: sites = [] } = useMaster<{ id: string; name: string; client_id: string }>("sites", "id,name,client_id");
  const { data: catalog = [] } = useMaster<{ id: string; description: string; default_uom: string | null; default_rate: number | null }>(
    "item_catalog", "id,description,default_uom,default_rate"
  );
  const { data: uoms = [] } = useMaster<{ id: string; code: string }>("uoms", "id,code");
  const invalidate = useInvalidateMaster();

  const clientOpts = toOptions(clients);
  const siteOpts = toOptions(sites.filter((s) => !clientId || s.client_id === clientId));

  const itemOpts = catalog.map((c) => ({
    value: c.id, label: c.description,
    sublabel: `${c.default_uom || "—"} · ₹${c.default_rate ?? 0}`,
  }));
  const uomOpts = uoms.map((u) => ({ value: u.code, label: u.code }));

  useEffect(() => {
    if (isNew) return;
    (async () => {
      const { data: q } = await supabase.from("quotations").select("*").eq("id", id!).single();
      if (q) {
        setClientName(q.client_name); setSiteName((q as any).site); setStatus(q.status);
        setClientId((q as any).client_id || ""); setSiteId((q as any).site_id || "");
        // site (area) removed
        setMergedPoId((q as any).merged_po_id || null);
        setAmendmentSerial((q as any).amendment_serial ?? null);
        if ((q as any).doc_date) setDocDate((q as any).doc_date);
        setQuotationNo((q as any).quotation_no || "");
      }

      const { data: its } = await supabase.from("quotation_items").select("*").eq("quotation_id", id!);
      if (its && its.length) setItems(its.map((i) => ({
        id: i.id, description: i.description, uom: i.uom,
        quantity: String(Number(i.quantity)), rate: String(Number(i.rate)),
      })));
    })();
  }, [id, isNew]);

  // Auto-suggest next quotation number for a brand-new quotation.
  useEffect(() => {
    if (!isNew || quotationNo) return;
    (async () => {
      const { data } = await supabase.from("quotations").select("quotation_no").not("quotation_no", "is", null);
      let maxN = 0;
      (data || []).forEach((r: any) => {
        const m = String(r.quotation_no || "").match(/(\d+)\s*$/);
        if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
      });
      setQuotationNo(`QT-${String(maxN + 1).padStart(5, "0")}`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew]);


  useEffect(() => {
    if (!clientId) return;
    const cs = sites.filter((s) => s.client_id === clientId);
    if (cs.length === 1) { setSiteId(cs[0].id); setSiteName(cs[0].name); }
    else if (siteId && !cs.some((s) => s.id === siteId)) { setSiteId(""); setSiteName(""); }
  }, [clientId, sites]);




  const setItem = (idx: number, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addRow = () => setItems((p) => [...p, { description: "", uom: "nos", quantity: "", rate: "" }]);
  const delRow = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));

  const pickItem = (idx: number, value: string) => {
    const c = catalog.find((x) => x.id === value);
    if (!c) return;
    setItem(idx, {
      item_id: c.id, description: c.description,
      uom: c.default_uom || "nos", rate: String(Number(c.default_rate ?? 0)),
    });
  };

  const locked = status === "merged" || status === "converted";

  const save = async () => {
    if (locked) return toast.error(`Quotation is ${status} — cannot edit header fields. Re-open to edit line items only.`);
    if (!clientName.trim() || !siteName.trim()) return toast.error("Client & work order required");
    if (items.some((i) => !i.description.trim() || !i.uom)) return toast.error("All line items need description & UoM");
    setLoading(true);
    let qid = id!;
    const payload = {
      client_name: clientName, site: siteName,
      client_id: clientId || null, site_id: siteId || null,
      doc_date: docDate,
      quotation_no: quotationNo.trim() || null,
    } as any;

    if (isNew) {
      const { data, error } = await supabase.from("quotations").insert(payload).select().single();
      if (error || !data) { toast.error(error?.message || "Failed"); setLoading(false); return; }
      qid = data.id;
    } else {
      await supabase.from("quotations").update(payload).eq("id", qid);
      await supabase.from("quotation_items").delete().eq("quotation_id", qid);
    }
    await supabase.from("quotation_items").insert(items.map((i) => ({
      quotation_id: qid, description: i.description, uom: i.uom,
      quantity: Number(i.quantity) || 0, rate: Number(i.rate) || 0,
    })));
    toast.success("Saved");
    setLoading(false);
    navigate(`/admin/quotations/${qid}`);
  };

  // Edit-line-items-only save (allowed even when converted, so Sync has something to push).
  const saveItemsOnly = async () => {
    if (isNew) return toast.error("Save first");
    await supabase.from("quotation_items").delete().eq("quotation_id", id!);
    await supabase.from("quotation_items").insert(items.map((i) => ({
      quotation_id: id!, description: i.description, uom: i.uom,
      quantity: Number(i.quantity) || 0, rate: Number(i.rate) || 0,
    })));
    toast.success("Line items saved. Use Sync to PO to push changes.");
  };

  const [convertOpen, setConvertOpen] = useState(false);
  const [poNumber, setPoNumber] = useState("");
  const [converting, setConverting] = useState(false);

  const convert = async () => {
    if (isNew) return toast.error("Save first");
    const num = poNumber.trim();
    if (!num) return toast.error("PO Number is required");
    setConverting(true);
    const { data: dup } = await supabase.from("purchase_orders").select("id").eq("po_number", num).maybeSingle();
    if (dup) { setConverting(false); return toast.error("PO Number already exists"); }
    const { data: po, error } = await supabase.from("purchase_orders")
      .insert({
        quotation_id: id!, client_name: clientName, site: siteName,
        client_id: clientId || null, site_id: siteId || null, 
        doc_date: docDate, po_number: num,
      } as any).select().single();
    if (error || !po) { setConverting(false); return toast.error(error?.message || "Failed"); }
    // Re-read quotation items with their IDs (state may not have them yet on a fresh save)
    const { data: qis } = await supabase.from("quotation_items").select("*").eq("quotation_id", id!);
    const rows = (qis || []).map((i: any) => ({
      po_id: po.id,
      description: i.description, uom: i.uom,
      quantity: Number(i.quantity) || 0,
      
      source_quotation_id: id!,
      source_quotation_item_id: i.id,
      amendment_serial: 10,
    }));
    if (rows.length) await supabase.from("po_line_items").insert(rows as any);
    await supabase.from("quotations").update({ status: "converted" }).eq("id", id!);
    setConverting(false);
    toast.success("Converted to PO");
    navigate(`/admin/purchase-orders/${po.id}`);
  };

  // ---------- Sync to PO ----------
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncSummary, setSyncSummary] = useState<{ updates: number; adds: number; targetPoId: string | null }>({ updates: 0, adds: 0, targetPoId: null });
  const [syncing, setSyncing] = useState(false);

  // Normalize key for fallback matching of legacy PO rows that have no source link.
  const fbKey = (desc: string | null | undefined, uom: string | null | undefined) =>
    `${(desc || "").trim().toLowerCase()}|${(uom || "").trim().toLowerCase()}`;

  // Pair each quotation item with a PO row (by source link first, then by description+uom fallback).
  // Returns { updates, adds, plan } where plan is the list of operations to execute on sync.
  const computeSyncPlan = (
    qis: any[],
    plis: Array<{ id: string; source_quotation_item_id: string | null; quantity: number; description: string; uom: string; amendment_serial?: number | null }>,
  ) => {
    const primary = new Map<string, any>();
    plis.forEach((p) => { if (p.source_quotation_item_id) primary.set(p.source_quotation_item_id, p); });

    // Group unlinked PO rows by desc|uom, prefer amendment_serial = 10 first.
    const unlinkedByKey = new Map<string, any[]>();
    plis
      .filter((p) => !p.source_quotation_item_id)
      .sort((a, b) => (Number(a.amendment_serial ?? 10) - Number(b.amendment_serial ?? 10)))
      .forEach((p) => {
        const k = fbKey(p.description, p.uom);
        if (!unlinkedByKey.has(k)) unlinkedByKey.set(k, []);
        unlinkedByKey.get(k)!.push(p);
      });

    let updates = 0, adds = 0;
    const plan: Array<{ kind: "update" | "add" | "link-update"; qi: any; pli?: any }> = [];

    for (const qi of qis) {
      const linked = primary.get(qi.id);
      if (linked) {
        if (
          Number(linked.quantity) !== Number(qi.quantity) ||
          linked.description !== qi.description ||
          linked.uom !== qi.uom
        ) updates++;
        plan.push({ kind: "update", qi, pli: linked });
        continue;
      }
      const bucket = unlinkedByKey.get(fbKey(qi.description, qi.uom));
      const candidate = bucket && bucket.length ? bucket.shift() : null;
      if (candidate) {
        updates++;
        plan.push({ kind: "link-update", qi, pli: candidate });
      } else {
        adds++;
        plan.push({ kind: "add", qi });
      }
    }
    return { updates, adds, plan };
  };

  const openSync = async () => {
    const { data: po } = await supabase.from("purchase_orders").select("id").eq("quotation_id", id!).maybeSingle();
    if (!po) return toast.error("No linked PO found");
    const { data: qis } = await supabase.from("quotation_items").select("*").eq("quotation_id", id!);
    const { data: plis } = await supabase
      .from("po_line_items")
      .select("id,source_quotation_item_id,quantity,description,uom,amendment_serial")
      .eq("po_id", po.id);
    const { updates, adds } = computeSyncPlan(qis || [], (plis || []) as any);
    setSyncSummary({ updates, adds, targetPoId: po.id });
    setSyncOpen(true);
  };

  const runSync = async () => {
    if (!syncSummary.targetPoId) return;
    setSyncing(true);
    try {
      const { data: qis } = await supabase.from("quotation_items").select("*").eq("quotation_id", id!);
      const { data: plis } = await supabase
        .from("po_line_items")
        .select("id,source_quotation_item_id,quantity,description,uom,amendment_serial")
        .eq("po_id", syncSummary.targetPoId);
      const { plan } = computeSyncPlan(qis || [], (plis || []) as any);

      const toAdd: any[] = [];
      for (const step of plan) {
        const qi = step.qi;
        if (step.kind === "update" && step.pli) {
          await supabase.from("po_line_items").update({
            description: qi.description,
            uom: qi.uom,
            quantity: Number(qi.quantity) || 0,
          }).eq("id", step.pli.id);
        } else if (step.kind === "link-update" && step.pli) {
          // Update qty/desc/uom AND back-fill the source link so future syncs match cleanly.
          await supabase.from("po_line_items").update({
            description: qi.description,
            uom: qi.uom,
            quantity: Number(qi.quantity) || 0,
            source_quotation_id: id!,
            source_quotation_item_id: qi.id,
          }).eq("id", step.pli.id);
        } else if (step.kind === "add") {
          toAdd.push({
            po_id: syncSummary.targetPoId,
            description: qi.description,
            uom: qi.uom,
            quantity: Number(qi.quantity) || 0,
            
            source_quotation_id: id!,
            source_quotation_item_id: qi.id,
            amendment_serial: 10,
          });
        }
      }
      if (toAdd.length) await supabase.from("po_line_items").insert(toAdd as any);
      toast.success(`Synced ${syncSummary.updates} update(s), ${syncSummary.adds} addition(s)`);
      setSyncOpen(false);
    } finally {
      setSyncing(false);
    }
  };

  // ---------- Merge into existing PO ----------
  const [mergeOpen, setMergeOpen] = useState(false);
  const [eligiblePos, setEligiblePos] = useState<Array<{ id: string; po_number: string | null; doc_date: string }>>([]);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [merging, setMerging] = useState(false);

  const openMerge = async () => {
    if (!clientId || !siteName) return toast.error("Pick client and work order first");
    const { data: pos } = await supabase.from("purchase_orders")
      .select("id,po_number,doc_date")
      .eq("client_id", clientId).eq("site", siteName)
      .order("doc_date", { ascending: false });
    if (!pos || pos.length === 0) return toast.error("No matching POs found for this client + work order");
    setEligiblePos(pos as any);
    setMergeTargetId(pos[0].id);
    setMergeOpen(true);
  };

  const runMerge = async () => {
    if (!mergeTargetId) return;
    setMerging(true);
    try {
      const { data: existing } = await supabase.from("po_line_items")
        .select("amendment_serial").eq("po_id", mergeTargetId);
      const maxSerial = (existing || []).reduce((m: number, r: any) => Math.max(m, Number(r.amendment_serial || 0)), 0);
      const newSerial = (maxSerial || 0) + 10;
      const { data: qis } = await supabase.from("quotation_items").select("*").eq("quotation_id", id!);
      const rows = (qis || []).map((qi: any) => ({
        po_id: mergeTargetId,
        description: qi.description, uom: qi.uom,
        quantity: Number(qi.quantity) || 0,
        
        source_quotation_id: id!,
        source_quotation_item_id: qi.id,
        amendment_serial: newSerial,
      }));
      if (rows.length) {
        const { error } = await supabase.from("po_line_items").insert(rows as any);
        if (error) { toast.error(error.message); return; }
      }
      await supabase.from("quotations").update({
        status: "merged", merged_po_id: mergeTargetId, amendment_serial: newSerial,
      }).eq("id", id!);
      toast.success(`Merged as amendment ${String(newSerial).padStart(5, "0")}`);
      setMergeOpen(false);
      navigate(`/admin/purchase-orders/${mergeTargetId}`);
    } finally {
      setMerging(false);
    }
  };

  const total = useMemo(
    () => items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.rate) || 0), 0),
    [items]
  );

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-semibold">{isNew ? "New Quotation" : "Quotation"}</h2>
        {!isNew && (
          <div className="flex items-center gap-2">
            {status === "merged" && amendmentSerial != null && (
              <span className="text-xs text-muted-foreground">Amendment {String(amendmentSerial).padStart(5, "0")}</span>
            )}
            <Badge variant={status === "converted" ? "default" : status === "merged" ? "secondary" : "outline"}>{status}</Badge>
          </div>
        )}
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Date</label>
            <DatePicker value={docDate} onChange={setDocDate} className="w-full" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Client</label>
            <SearchableSelect
              value={clientId}
              onChange={(v, opt) => { setClientId(v); setClientName(opt?.label || ""); }}
              options={clientOpts}
              placeholder="Select or add client"
              disabled={locked}
              onCreate={async (text) => {
                const opt = await createMaster("clients", { name: text });
                if (opt) { invalidate("clients"); setClientName(text); }
                return opt;
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Work Order Name</label>
            <SearchableSelect
              value={siteId}
              onChange={async (v, opt) => {
                setSiteId(v); setSiteName(opt?.label || "");
                invalidate("areas");
                if (!isNew && locked) {
                  await supabase.from("quotations")
                    .update({ site_id: v || null, site: opt?.label || "" })
                    .eq("id", id!);
                }
              }}
              options={siteOpts}
              placeholder={clientId ? "Select or add work order" : "Pick client first"}
              disabled={!clientId}
              onCreate={async (text) => {
                if (!clientId) return null;
                const opt = await createMaster("sites", { name: text, client_id: clientId });
                if (opt) {
                  invalidate("sites"); setSiteName(text);
                  if (!isNew && locked) {
                    await supabase.from("quotations")
                      .update({ site_id: opt.value, site: text })
                      .eq("id", id!);
                  }
                }
                return opt;
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Quotation No.</label>
            <Input
              value={quotationNo}
              placeholder="e.g. QT-00001"
              disabled={status === "merged"}
              onChange={(e) => setQuotationNo(e.target.value)}
              onBlur={async () => {
                if (!isNew && (status === "draft" || status === "converted")) {
                  const v = quotationNo.trim();
                  const { error } = await supabase.from("quotations")
                    .update({ quotation_no: v || null } as any).eq("id", id!);
                  if (error) toast.error(error.message);
                }
              }}
            />
          </div>

        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Line Items</h3>
          <Button size="sm" variant="outline" onClick={addRow} disabled={status === "merged"}><Plus className="h-4 w-4" />Add</Button>
        </div>
        <div className="space-y-2">
          {items.map((it, idx) => {
            const amount = (Number(it.quantity) || 0) * (Number(it.rate) || 0);
            return (
              <div key={idx} className="space-y-1">
                <div className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-12 md:col-span-5">
                    <SearchableSelect
                      value={it.item_id || ""}
                      onChange={(v) => v ? pickItem(idx, v) : null}
                      options={itemOpts}
                      placeholder={it.description || "Pick or add item"}
                      disabled={status === "merged"}
                      onCreate={async (text) => {
                        const opt = await createMaster("item_catalog",
                          { description: text, default_uom: it.uom || null, default_rate: Number(it.rate) || 0 },
                          "description"
                        );
                        if (opt) { invalidate("item_catalog"); setItem(idx, { item_id: opt.value, description: text }); }
                        return opt;
                      }}
                    />
                  </div>
                  <SearchableSelect className="col-span-4 md:col-span-2"
                    value={it.uom}
                    onChange={(v) => setItem(idx, { uom: v })}
                    options={uomOpts} placeholder="UoM"
                    disabled={status === "merged"}
                  />
                  <Input className="col-span-4 md:col-span-2" type="number" inputMode="decimal" placeholder="Qty"
                    value={it.quantity} disabled={status === "merged"}
                    onChange={(e) => setItem(idx, { quantity: e.target.value })} />
                  <Input className="col-span-3 md:col-span-2" type="number" inputMode="decimal" placeholder="Rate"
                    value={it.rate} disabled={status === "merged"}
                    onChange={(e) => setItem(idx, { rate: e.target.value })} />
                  <Button variant="ghost" size="icon" className="col-span-1" onClick={() => delRow(idx)} disabled={status === "merged"}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  Amount: <span className="font-medium text-foreground">₹{amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end border-t pt-2">
          <div className="text-base">Grand Total: <span className="font-bold text-lg">₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span></div>
        </div>
      </Card>

      <div className="flex gap-2 flex-wrap">
        {status === "converted" ? (
          <>
            <Button onClick={saveItemsOnly} variant="outline">Save line item edits</Button>
            <Button onClick={openSync}><RefreshCw className="h-4 w-4" />Sync to PO</Button>
          </>
        ) : status === "merged" ? null : (
          <Button onClick={save} disabled={loading}>Save</Button>
        )}

        {!isNew && status === "draft" && (
          <>
            <Button variant="default" onClick={() => { setPoNumber(""); setConvertOpen(true); }}>Convert to PO</Button>
            <Button variant="secondary" onClick={openMerge}><GitMerge className="h-4 w-4" />Merge into existing PO</Button>
          </>
        )}

        {/* Convert dialog */}
        <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Convert to Purchase Order</DialogTitle></DialogHeader>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">PO Number *</label>
              <Input autoFocus value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="e.g. PO-2026-001" />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConvertOpen(false)}>Cancel</Button>
              <Button onClick={convert} disabled={converting || !poNumber.trim()}>Create PO</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Sync dialog */}
        <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Sync changes to PO</DialogTitle></DialogHeader>
            <div className="text-sm space-y-2">
              <p><b>{syncSummary.updates}</b> line item(s) will be updated (quantity/description).</p>
              <p><b>{syncSummary.adds}</b> new line item(s) will be added.</p>
              <p className="text-xs text-muted-foreground">PO line items are never removed. Quantities and descriptions on matched rows are updated to match the latest quotation.</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSyncOpen(false)}>Cancel</Button>
              <Button onClick={runSync} disabled={syncing || (syncSummary.updates === 0 && syncSummary.adds === 0)}>
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Merge dialog */}
        <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Merge into existing PO</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">A new amendment will be created on the selected PO. All line items will be added as new rows under that amendment serial.</p>
              <SearchableSelect
                value={mergeTargetId}
                onChange={setMergeTargetId}
                options={eligiblePos.map((p) => ({ value: p.id, label: `${p.po_number || "(no #)"} · ${p.doc_date}` }))}
                placeholder="Select target PO"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMergeOpen(false)}>Cancel</Button>
              <Button onClick={runMerge} disabled={merging || !mergeTargetId}>{merging ? "Merging…" : "Merge"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {!isNew && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="ml-auto"><Trash2 className="h-4 w-4" />Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this quotation?</AlertDialogTitle>
                <AlertDialogDescription>Removes line items. Any linked PO is unaffected.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={async () => {
                  await supabase.from("quotation_items").delete().eq("quotation_id", id!);
                  const { error } = await supabase.from("quotations").delete().eq("id", id!);
                  if (error) return toast.error(error.message);
                  toast.success("Deleted"); navigate("/admin/quotations");
                }}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {mergedPoId && (
        <p className="text-xs text-muted-foreground">
          This quotation was merged into PO <a className="underline" href={`/admin/purchase-orders/${mergedPoId}`}>view</a>.
        </p>
      )}
    </div>
  );
}
