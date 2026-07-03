import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { toast } from "sonner";
import { CsvImportDialog } from "@/components/CsvImportDialog";

type Client = { id: string; name: string; phone: string | null; address: string | null };
type Site = { id: string; client_id: string; name: string; address: string | null };
type Area = { id: string; site_id: string; name: string };

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);

  // Client dialog
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [addr, setAddr] = useState("");

  // Site dialog
  const [siteOpen, setSiteOpen] = useState<string | null>(null); // client_id when adding new
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [siteName, setSiteName] = useState(""); const [siteAddr, setSiteAddr] = useState("");

  // Area edit dialog
  const [areaEditOpen, setAreaEditOpen] = useState(false);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [areaEditName, setAreaEditName] = useState("");

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedSite, setExpandedSite] = useState<Record<string, boolean>>({});
  const [areaInput, setAreaInput] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  const load = async () => {
    const [{ data: c }, { data: s }, { data: a }] = await Promise.all([
      supabase.from("clients").select("*").order("name"),
      supabase.from("sites").select("*").order("name"),
      supabase.from("areas").select("*").order("name"),
    ]);
    setClients(c || []); setSites(s || []); setAreas((a as any) || []);
  };
  useEffect(() => { load(); }, []);

  const resetClient = () => { setEditingId(null); setName(""); setPhone(""); setAddr(""); };
  const openNewClient = () => { resetClient(); setOpen(true); };
  const openEditClient = (c: Client) => {
    setEditingId(c.id); setName(c.name); setPhone(c.phone || ""); setAddr(c.address || ""); setOpen(true);
  };
  const saveClient = async () => {
    if (!name.trim()) return toast.error("Name required");
    const payload = { name, phone: phone || null, address: addr || null };
    const { error } = editingId
      ? await supabase.from("clients").update(payload).eq("id", editingId)
      : await supabase.from("clients").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editingId ? "Client updated" : "Client added");
    setOpen(false); resetClient(); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete client and its work orders?")) return;
    await supabase.from("clients").delete().eq("id", id); load();
  };

  const openNewSite = (clientId: string) => {
    setEditingSiteId(null); setSiteName(""); setSiteAddr(""); setSiteOpen(clientId);
  };
  const openEditSite = (s: Site) => {
    setEditingSiteId(s.id); setSiteName(s.name); setSiteAddr(s.address || ""); setSiteOpen(s.client_id);
  };
  const saveSite = async () => {
    if (!siteOpen || !siteName.trim()) return;
    const { error } = editingSiteId
      ? await supabase.from("sites").update({ name: siteName, address: siteAddr || null }).eq("id", editingSiteId)
      : await supabase.from("sites").insert({ client_id: siteOpen, name: siteName, address: siteAddr || null });
    if (error) return toast.error(error.message);
    toast.success(editingSiteId ? "Work order updated" : "Work order added");
    setSiteOpen(null); setEditingSiteId(null); setSiteName(""); setSiteAddr(""); load();
  };

  const removeSite = async (id: string) => {
    if (!confirm("Delete work order?")) return;
    await supabase.from("sites").delete().eq("id", id); load();
  };

  const addArea = async (siteId: string) => {
    const n = (areaInput[siteId] || "").trim();
    if (!n) return;
    const { error } = await supabase.from("areas").insert({ site_id: siteId, name: n });
    if (error) return toast.error(error.message);
    setAreaInput((p) => ({ ...p, [siteId]: "" })); load();
  };
  const openEditArea = (a: Area) => { setEditingAreaId(a.id); setAreaEditName(a.name); setAreaEditOpen(true); };
  const saveArea = async () => {
    if (!editingAreaId || !areaEditName.trim()) return;
    const { error } = await supabase.from("areas").update({ name: areaEditName.trim() }).eq("id", editingAreaId);
    if (error) return toast.error(error.message);
    setAreaEditOpen(false); setEditingAreaId(null); load();
  };
  const removeArea = async (id: string) => {
    if (!confirm("Delete site?")) return;
    await supabase.from("areas").delete().eq("id", id); load();
  };

  const filtered = clients.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || "").includes(search)
  );

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-xl font-semibold">Clients</h2>
        <div className="flex gap-2">
          <CsvImportDialog
            table="clients"
            templateName="clients-template.csv"
            fields={[{ key: "name", required: true }, { key: "phone" }, { key: "address" }]}
            sample={[["Acme Corp", "9876543210", "123 Main St"]]}
            mapRow={(r) => ({ name: r.name, phone: r.phone || null, address: r.address || null })}
            onDone={load}
          />
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetClient(); }}>
            <DialogTrigger asChild><Button onClick={openNewClient}><Plus className="h-4 w-4" />Add</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "Edit Client" : "New Client"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
                <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Input placeholder="Address" value={addr} onChange={(e) => setAddr(e.target.value)} />
              </div>
              <DialogFooter><Button onClick={saveClient}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Input placeholder="Search clients…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="grid gap-2">
        {filtered.map((c) => {
          const cSites = sites.filter((s) => s.client_id === c.id);
          const ex = !!expanded[c.id];
          return (
            <Card key={c.id} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <button className="flex items-center gap-2 text-left flex-1" onClick={() => setExpanded((p) => ({ ...p, [c.id]: !ex }))}>
                  {ex ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.phone || "—"} · {cSites.length} work order(s)</div>
                  </div>
                </button>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditClient(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              {ex && (
                <div className="mt-3 pl-6 space-y-2">
                  {cSites.map((s) => {
                    const sAreas = areas.filter((a) => a.site_id === s.id);
                    const sEx = !!expandedSite[s.id];
                    return (
                      <div key={s.id} className="border-l-2 border-muted pl-2">
                        <div className="flex items-center justify-between text-sm">
                          <button className="flex items-center gap-2 text-left flex-1" onClick={() => setExpandedSite((p) => ({ ...p, [s.id]: !sEx }))}>
                            {sEx ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span>{s.name}</span>
                            <span className="text-xs text-muted-foreground">{s.address || ""} · {sAreas.length} site(s)</span>
                          </button>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditSite(s)}><Pencil className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => removeSite(s.id)}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </div>
                        {sEx && (
                          <div className="pl-5 mt-2 space-y-1">
                            {sAreas.map((a) => (
                              <div key={a.id} className="flex items-center justify-between text-xs">
                                <span>· {a.name}</span>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEditArea(a)}><Pencil className="h-3 w-3" /></Button>
                                  <Button variant="ghost" size="icon" onClick={() => removeArea(a.id)}><Trash2 className="h-3 w-3" /></Button>
                                </div>
                              </div>
                            ))}
                            <div className="flex gap-2 pt-1">
                              <Input
                                placeholder="New site (e.g. Block A)"
                                className="h-8 text-xs"
                                value={areaInput[s.id] || ""}
                                onChange={(e) => setAreaInput((p) => ({ ...p, [s.id]: e.target.value }))}
                                onKeyDown={(e) => e.key === "Enter" && addArea(s.id)}
                              />
                              <Button size="sm" variant="outline" onClick={() => addArea(s.id)}><Plus className="h-3 w-3" /></Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <Button size="sm" variant="outline" onClick={() => openNewSite(c.id)}><Plus className="h-3 w-3" />Add work order</Button>
                </div>
              )}
            </Card>
          );
        })}
        {filtered.length === 0 && <div className="text-sm text-muted-foreground">No clients.</div>}
      </div>

      <Dialog open={!!siteOpen} onOpenChange={(o) => { if (!o) { setSiteOpen(null); setEditingSiteId(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingSiteId ? "Edit Work Order" : "New Work Order"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Work order name" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
            <Input placeholder="Address" value={siteAddr} onChange={(e) => setSiteAddr(e.target.value)} />
          </div>
          <DialogFooter><Button onClick={saveSite}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={areaEditOpen} onOpenChange={setAreaEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Site</DialogTitle></DialogHeader>
          <Input value={areaEditName} onChange={(e) => setAreaEditName(e.target.value)} />
          <DialogFooter><Button onClick={saveArea}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
