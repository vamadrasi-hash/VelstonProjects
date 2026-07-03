import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

type Row = { id: string; name: string };

export default function Designations() {
  const [list, setList] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = async () => {
    const { data } = await supabase.from("designations").select("*").order("name");
    setList((data as any) || []);
  };
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("designations").insert({ name: name.trim() });
    if (error) return toast.error(error.message);
    setName(""); load();
  };
  const openEdit = (d: Row) => { setEditingId(d.id); setEditName(d.name); setEditOpen(true); };
  const saveEdit = async () => {
    if (!editName.trim() || !editingId) return;
    const { error } = await supabase.from("designations").update({ name: editName.trim() }).eq("id", editingId);
    if (error) return toast.error(error.message);
    setEditOpen(false); setEditingId(null); load();
  };
  const del = async (id: string) => {
    if (!confirm("Delete designation?")) return;
    await supabase.from("designations").delete().eq("id", id); load();
  };
  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-semibold">Designations</h2>
      <Card className="p-3 flex flex-wrap gap-2">
        <Input className="flex-1 min-w-[160px]" placeholder="e.g. Mason" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={add}><Plus className="h-4 w-4" />Add</Button>
      </Card>
      <div className="grid gap-2">
        {list.map((d) => (
          <Card key={d.id} className="p-3 flex items-center justify-between">
            <div className="font-medium">{d.name}</div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => del(d.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
      </div>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Designation</DialogTitle></DialogHeader>
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          <DialogFooter><Button onClick={saveEdit}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
