import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { CsvImportDialog } from "@/components/CsvImportDialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useMaster, toOptions } from "@/lib/masters";

type Item = { id: string; description: string; default_uom: string | null; default_rate: number | null };

export default function ItemCatalog() {
  const [list, setList] = useState<Item[]>([]);
  const { data: uoms = [] } = useMaster<{ id: string; code: string }>("uoms", "id,code");
  const uomOptions = toOptions(uoms.map((u) => ({ id: u.code, name: u.code })));
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [desc, setDesc] = useState(""); const [uom, setUom] = useState(""); const [rate, setRate] = useState<number>(0);
  const [search, setSearch] = useState("");

  const load = async () => {
    const { data } = await supabase.from("item_catalog").select("*").order("description");
    setList((data as any) || []);
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setEditingId(null); setDesc(""); setUom(""); setRate(0); };
  const openNew = () => { reset(); setOpen(true); };
  const openEdit = (i: Item) => {
    setEditingId(i.id); setDesc(i.description); setUom(i.default_uom || ""); setRate(Number(i.default_rate || 0)); setOpen(true);
  };

  const save = async () => {
    if (!desc.trim()) return toast.error("Description required");
    const payload = { description: desc, default_uom: uom || null, default_rate: rate };
    const { error } = editingId
      ? await supabase.from("item_catalog").update(payload).eq("id", editingId)
      : await supabase.from("item_catalog").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editingId ? "Item updated" : "Item added"); setOpen(false); reset(); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete item?")) return;
    await supabase.from("item_catalog").delete().eq("id", id); load();
  };

  const validUoms = new Set(uoms.map((u) => u.code.toLowerCase()));
  const filtered = list.filter((i) => !search || i.description.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-xl font-semibold">Item Catalog</h2>
        <div className="flex gap-2">
          <CsvImportDialog
            table="item_catalog"
            templateName="items-template.csv"
            fields={[{ key: "description", required: true }, { key: "default_uom" }, { key: "default_rate" }]}
            sample={[["Brick masonry", "sqft", "55"]]}
            mapRow={(r) => {
              const u = (r.default_uom || "").toLowerCase();
              if (u && !validUoms.has(u)) throw new Error(`Unknown UoM "${r.default_uom}"`);
              const rt = r.default_rate ? Number(r.default_rate) : 0;
              if (r.default_rate && Number.isNaN(rt)) throw new Error("Invalid rate");
              return { description: r.description, default_uom: u || null, default_rate: rt };
            }}
            onDone={load}
          />
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4" />Add</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "Edit Item" : "New Item"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
                <SearchableSelect value={uom} onChange={setUom} options={uomOptions} placeholder="Default UoM" />
                <Input type="number" placeholder="Default rate" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
              </div>
              <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Input placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="grid gap-2">
        {filtered.map((i) => (
          <Card key={i.id} className="p-3 flex items-center justify-between">
            <div>
              <div className="font-medium">{i.description}</div>
              <div className="text-xs text-muted-foreground">{i.default_uom || "—"} · ₹ {i.default_rate ?? 0}</div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => remove(i.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <div className="text-sm text-muted-foreground">No items.</div>}
      </div>
    </div>
  );
}
