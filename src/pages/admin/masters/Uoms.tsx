import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

type Row = { id: string; code: string; label: string };

export default function Uoms() {
  const [list, setList] = useState<Row[]>([]);
  const [code, setCode] = useState(""); const [label, setLabel] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eCode, setECode] = useState(""); const [eLabel, setELabel] = useState("");

  const load = async () => {
    const { data } = await supabase.from("uoms").select("*").order("code");
    setList((data as any) || []);
  };
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!code.trim() || !label.trim()) return toast.error("Both fields required");
    const { error } = await supabase.from("uoms").insert({ code: code.toLowerCase(), label });
    if (error) return toast.error(error.message);
    setCode(""); setLabel(""); load();
  };
  const openEdit = (u: Row) => { setEditingId(u.id); setECode(u.code); setELabel(u.label); setEditOpen(true); };
  const saveEdit = async () => {
    if (!eCode.trim() || !eLabel.trim() || !editingId) return toast.error("Both fields required");
    const { error } = await supabase.from("uoms").update({ code: eCode.toLowerCase(), label: eLabel }).eq("id", editingId);
    if (error) return toast.error(error.message);
    setEditOpen(false); setEditingId(null); load();
  };
  const del = async (id: string) => {
    if (!confirm("Delete UoM?")) return;
    await supabase.from("uoms").delete().eq("id", id); load();
  };
  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-semibold">Units of Measure</h2>
      <Card className="p-3 flex gap-2 flex-wrap">
        <Input className="flex-1 min-w-[120px]" placeholder="Code (e.g. sqft)" value={code} onChange={(e) => setCode(e.target.value)} />
        <Input className="flex-1 min-w-[160px]" placeholder="Label (e.g. Square Feet)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button onClick={add}><Plus className="h-4 w-4" />Add</Button>
      </Card>
      <div className="grid gap-2">
        {list.map((u) => (
          <Card key={u.id} className="p-3 flex items-center justify-between">
            <div><span className="font-medium">{u.code}</span> <span className="text-muted-foreground text-sm">— {u.label}</span></div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => del(u.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
      </div>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit UoM</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Code" value={eCode} onChange={(e) => setECode(e.target.value)} />
            <Input placeholder="Label" value={eLabel} onChange={(e) => setELabel(e.target.value)} />
          </div>
          <DialogFooter><Button onClick={saveEdit}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
