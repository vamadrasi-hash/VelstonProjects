import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Download } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/lib/role";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useMaster, createMaster, toOptions, useInvalidateMaster } from "@/lib/masters";
import { EmployeeFormFields, EmpFields, blankEmp, validateEmp } from "@/components/EmployeeFormFields";
import { EmployeePhoto } from "@/components/EmployeePhoto";
import { XlsxImportDialog } from "@/components/XlsxImportDialog";
import { downloadXlsx } from "@/lib/xlsx";

type Worker = {
  id: string; name: string; designation: string; contractor_id: string | null;
  is_busy: boolean; current_supervisor_id: string | null; current_line_item_id: string | null;
  daily_rate: number; contractor_share_amount: number; photo_url: string | null;
  scrum_id: string | null; mobile: string | null; aadhar: string | null; gender: string | null;
  employee_type_id: string | null;
};
type LineCtx = { id: string; description: string; site: string; area: string | null };

export default function Workers() {
  const [list, setList] = useState<Worker[]>([]);
  const [lineCtx, setLineCtx] = useState<Record<string, LineCtx>>({});
  const { supervisors } = useRole();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const contractorFilter = params.get("contractor") || "";
  const designationFilter = params.get("designation") || "";
  const status = params.get("status") || "all";
  const [search, setSearch] = useState("");

  const { data: contractors = [] } = useMaster<{ id: string; name: string }>("contractors", "id,name");
  const { data: designations = [] } = useMaster<{ id: string; name: string }>("designations", "id,name");
  const invalidate = useInvalidateMaster();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [emp, setEmp] = useState<EmpFields>(blankEmp);
  const [designation, setDesignation] = useState("");
  const [contractorId, setContractorId] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [shareAmount, setShareAmount] = useState("");

  const load = async () => {
    const { data } = await supabase.from("workers").select("*").order("name");
    const ws = (data as any) || [];
    setList(ws);
    const lids = Array.from(new Set(ws.map((w: Worker) => w.current_line_item_id).filter(Boolean))) as string[];
    if (lids.length === 0) { setLineCtx({}); return; }
    const { data: lis } = await supabase
      .from("po_line_items")
      .select("id, description, purchase_orders(site, areas(name))")
      .in("id", lids);
    const ctx: Record<string, LineCtx> = {};
    (lis || []).forEach((x: any) => {
      ctx[x.id] = {
        id: x.id, description: x.description,
        site: x.purchase_orders?.site || "—",
        area: x.purchase_orders?.areas?.name || null,
      };
    });
    setLineCtx(ctx);
  };
  useEffect(() => { load(); }, []);

  const reset = () => {
    setEditingId(null); setEmp(blankEmp);
    setDesignation(""); setContractorId(""); setDailyRate(""); setShareAmount("");
  };
  const openNew = () => { reset(); setOpen(true); };
  const openEdit = (w: Worker) => {
    setEditingId(w.id);
    setEmp({
      name: w.name, scrum_id: w.scrum_id || "", mobile: w.mobile || "",
      aadhar: w.aadhar || "", gender: w.gender || "",
      employee_type_id: w.employee_type_id || "",
      photo_url: w.photo_url || "",
    });
    setDesignation(w.designation);
    setContractorId(w.contractor_id || "");
    setDailyRate(String(w.daily_rate || ""));
    setShareAmount(String(w.contractor_share_amount || ""));
    setOpen(true);
  };

  const save = async () => {
    const err = validateEmp(emp);
    if (err) return toast.error(err);
    if (!designation.trim() || !contractorId) return toast.error("Designation & contractor required");
    const newShare = Number(shareAmount) || 0;
    const prevShare = editingId ? Number(list.find((w) => w.id === editingId)?.contractor_share_amount || 0) : newShare;
    const payload: any = {
      name: emp.name, scrum_id: emp.scrum_id || null, mobile: emp.mobile || null, aadhar: emp.aadhar || null,
      gender: emp.gender || null, employee_type_id: emp.employee_type_id,
      photo_url: emp.photo_url || null,
      designation, contractor_id: contractorId,
      daily_rate: Number(dailyRate) || 0,
      contractor_share_amount: newShare,
    };
    const savedId = editingId;
    const { error } = editingId
      ? await supabase.from("workers").update(payload).eq("id", editingId)
      : await supabase.from("workers").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editingId ? "Worker updated" : "Worker added");
    setOpen(false); reset(); load();
    if (savedId && newShare !== prevShare) {
      if (confirm("Contractor share changed. Recalculate past wages for this worker?")) {
        navigate(`/admin/wage-recalc?worker=${savedId}`);
      }
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete worker?")) return;
    await supabase.from("workers").delete().eq("id", id); load();
  };

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    setParams(p, { replace: true });
  };

  const cName = (id: string | null) => contractors.find((c) => c.id === id)?.name || "—";
  const sName = (id: string | null) => supervisors.find((s) => s.id === id)?.name || "—";

  const designationOpts = toOptions(designations);
  const contractorOpts = toOptions(contractors);

  const filtered = useMemo(() => list.filter((w) => {
    if (contractorFilter && w.contractor_id !== contractorFilter) return false;
    if (designationFilter) {
      const dn = designations.find((d) => d.id === designationFilter)?.name;
      if (dn && w.designation.toLowerCase() !== dn.toLowerCase()) return false;
    }
    if (status === "busy" && !w.is_busy) return false;
    if (status === "available" && w.is_busy) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!w.name.toLowerCase().includes(s)
        && !(w.aadhar || "").includes(search)
        && !(w.mobile || "").includes(search)
        && !(w.scrum_id || "").toLowerCase().includes(s)) return false;
    }
    return true;
  }), [list, contractorFilter, designationFilter, status, designations, search]);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-xl font-semibold">Workers <span className="text-sm text-muted-foreground font-normal">({filtered.length})</span></h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => {
            const src = filtered.length ? filtered : list;
            if (!src.length) {
              toast.warning("No workers to export");
              return;
            }
            const rows = src.map((w) => ({
              name: w.name,
              scrum_id: w.scrum_id || "",
              mobile: w.mobile || "",
              aadhar: w.aadhar || "",
              gender: w.gender || "",
              designation: w.designation,
              contractor: cName(w.contractor_id),
              daily_rate: w.daily_rate || 0,
              contractor_share_amount: w.contractor_share_amount || 0,
            }));
            const filename = `workers-${new Date().toISOString().slice(0,10)}.xlsx`;
            try {
              downloadXlsx(filename, rows, "Workers");
              toast.success(`Downloaded ${filename}`, {
                description: `${rows.length} worker(s) — check your browser's Downloads folder.`,
                duration: 6000,
              });
            } catch (e: any) {
              toast.error(e?.message || "Export failed");
            }
          }}>
            <Download className="h-4 w-4" />Export
          </Button>

          <XlsxImportDialog
            table="workers"
            templateName="workers-template.xlsx"
            label="Import"
            fields={[
              { key: "name", required: true },
              { key: "designation", required: true },
              { key: "contractor", required: true },
              { key: "daily_rate" },
              { key: "contractor_share_amount" },
              { key: "scrum_id" },
              { key: "mobile" },
              { key: "aadhar" },
              { key: "gender" },
            ]}
            sample={[["Ramesh Patel", "Mason", "ABC Contractor", "600", "0", "EMP01", "9999999999", "", "Male"]]}
            mapRow={async (r) => {
              const desigName = r["designation"];
              const contrName = r["contractor"];
              let desig = designations.find((d) => d.name.toLowerCase() === desigName.toLowerCase());
              if (!desig) {
                const created: any = await createMaster("designations", { name: desigName });
                if (!created) throw new Error("Could not create designation");
                desig = { id: created.value, name: created.label };
                invalidate("designations");
              }
              let contr = contractors.find((c) => c.name.toLowerCase() === contrName.toLowerCase());
              if (!contr) {
                const created: any = await createMaster("contractors", { name: contrName });
                if (!created) throw new Error("Could not create contractor");
                contr = { id: created.value, name: created.label };
                invalidate("contractors");
              }
              return {
                name: r["name"],
                designation: desig.name,
                contractor_id: contr.id,
                daily_rate: Number(r["daily_rate"]) || 0,
                contractor_share_amount: Number(r["contractor_share_amount"]) || 0,
                scrum_id: r["scrum_id"] || null,
                mobile: r["mobile"] || null,
                aadhar: r["aadhar"] || null,
                gender: r["gender"] || null,
              };
            }}
            onDone={load}
          />
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4" />Add</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingId ? "Edit Worker" : "New Worker"}</DialogTitle></DialogHeader>
              <EmployeeFormFields value={emp} onChange={setEmp} defaultType="Worker" hideType photoRole="worker" />
              <div className="space-y-3 pt-3 border-t">
                <SearchableSelect
                  value={designations.find((d) => d.name === designation)?.id || ""}
                  onChange={(_, opt) => setDesignation(opt?.label || "")}
                  options={designationOpts}
                  placeholder="Designation"
                  onCreate={async (text) => {
                    const opt = await createMaster("designations", { name: text });
                    if (opt) { invalidate("designations"); setDesignation(text); }
                    return opt;
                  }}
                />
                <SearchableSelect
                  value={contractorId}
                  onChange={setContractorId}
                  options={contractorOpts}
                  placeholder="Contractor"
                  onCreate={async (text) => {
                    const opt = await createMaster("contractors", { name: text });
                    if (opt) invalidate("contractors");
                    return opt;
                  }}
                />
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Daily Rate (₹/day)</div>
                  <Input type="number" placeholder="e.g. 600" value={dailyRate}
                    onChange={(e) => setDailyRate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Contractor Share (₹/day)</div>
                  <Input type="number" placeholder="0" value={shareAmount}
                    onChange={(e) => setShareAmount(e.target.value)} />
                  <div className="text-[11px] text-muted-foreground">
                    Carved out of worker's daily pay and paid to the contractor. 0 = no sharing.
                  </div>
                </div>
              </div>
              <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="p-3 space-y-3">
        <Input placeholder="Search name, Aadhar, mobile, Scrum ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="grid sm:grid-cols-2 gap-2">
          <SearchableSelect
            value={contractorFilter} onChange={(v) => setParam("contractor", v)}
            options={contractorOpts} placeholder="All contractors" allowClear
          />
          <SearchableSelect
            value={designationFilter} onChange={(v) => setParam("designation", v)}
            options={designationOpts} placeholder="All designations" allowClear
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {(["all", "available", "busy"] as const).map((s) => (
            <Badge key={s} variant={status === s ? "default" : "outline"}
              className="cursor-pointer capitalize" onClick={() => setParam("status", s === "all" ? "" : s)}>
              {s}
            </Badge>
          ))}
        </div>
      </Card>

      <div className="grid gap-2">
        {filtered.map((w) => (
          <Card key={w.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <EmployeePhoto path={w.photo_url} name={w.name} subtitle={`${w.designation} · ${cName(w.contractor_id)}`} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{w.name} <span className="text-xs text-muted-foreground">({w.designation})</span></div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                {w.scrum_id && <span>ID: {w.scrum_id}</span>}
                {w.mobile && <span>· 📱 {w.mobile}</span>}
                {w.aadhar && <span>· Aadhar {w.aadhar.slice(0,4)}…{w.aadhar.slice(-4)}</span>}
                <span>· {cName(w.contractor_id)}</span>
                {Number(w.daily_rate) > 0
                  ? <span className="text-foreground">· ₹{Number(w.daily_rate)}/day</span>
                  : <span className="text-destructive">· rate not set</span>}
                {Number(w.contractor_share_amount) > 0 && (
                  <span className="text-foreground">· share ₹{Number(w.contractor_share_amount)}</span>
                )}
                {w.is_busy && (() => {
                  const ctx = w.current_line_item_id ? lineCtx[w.current_line_item_id] : null;
                  const loc = ctx ? `${ctx.site}${ctx.area ? ` → ${ctx.area}` : ""}` : "";
                  return (
                    <span className="text-primary">
                      · Busy under {sName(w.current_supervisor_id)}{loc && ` · ${loc}`}{ctx?.description && ` · ${ctx.description}`}
                    </span>
                  );
                })()}
              </div>
            </div>
            <div className="flex gap-1 self-end sm:self-auto">
              <Button variant="ghost" size="icon" onClick={() => openEdit(w)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => remove(w.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <div className="text-muted-foreground text-sm">No workers match filters.</div>}
      </div>
    </div>
  );
}
