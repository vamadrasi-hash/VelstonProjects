import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { L } from "@/components/BilingualLabel";
import { EmployeePhoto } from "@/components/EmployeePhoto";
import { Users, MapPin, Search, Lock } from "lucide-react";
import { usePrimaryForSite } from "@/hooks/usePrimaryForSite";

type SiteAssign = { id: string; area_id: string };
type Area = { id: string; name: string };
type Supervisor = { id: string; name: string };
type Worker = {
  id: string; name: string; designation: string; photo_url: string | null;
  contractor_id: string | null;
  is_busy: boolean;
  current_supervisor_id: string | null;
  current_area_id: string | null;
};

export default function Assign() {
  const { supervisorId } = useRole();
  const [mySites, setMySites] = useState<{ areaId: string; name: string }[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [areas, setAreas] = useState<Record<string, string>>({});
  const [sups, setSups] = useState<Record<string, string>>({});
  const [contractors, setContractors] = useState<Record<string, string>>({});
  const [openArea, setOpenArea] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const primaryMap = usePrimaryForSite(supervisorId);

  const load = async () => {
    if (!supervisorId) return;
    const [{ data: lia }, { data: sas }, { data: ws }, { data: ars }, { data: spv }, { data: cts }] = await Promise.all([
      supabase.from("line_item_assignments").select("area_id,site_assignment_id").eq("supervisor_id", supervisorId),
      supabase.from("site_assignments").select("id,area_id"),
      supabase.from("workers").select("id,name,designation,photo_url,contractor_id,is_busy,current_supervisor_id,current_area_id"),
      supabase.from("areas").select("id,name"),
      supabase.from("supervisors").select("id,name"),
      supabase.from("contractors").select("id,name"),
    ]);
    const arMap: Record<string, string> = {};
    ((ars as any) || []).forEach((a: any) => (arMap[a.id] = a.name));
    setAreas(arMap);
    const spMap: Record<string, string> = {};
    ((spv as any) || []).forEach((s: any) => (spMap[s.id] = s.name));
    setSups(spMap);
    const cMap: Record<string, string> = {};
    ((cts as any) || []).forEach((c: any) => (cMap[c.id] = c.name));
    setContractors(cMap);
    const saArea: Record<string, string> = {};
    ((sas as any) || []).forEach((s: any) => (saArea[s.id] = s.area_id || ""));
    const seen = new Set<string>();
    const sites: { areaId: string; name: string }[] = [];
    ((lia as any) || []).forEach((row: any) => {
      const aid = row.area_id || (row.site_assignment_id ? saArea[row.site_assignment_id] : null);
      if (aid && !seen.has(aid)) {
        seen.add(aid);
        sites.push({ areaId: aid, name: arMap[aid] || "—" });
      }
    });
    sites.sort((a, b) => a.name.localeCompare(b.name));
    setMySites(sites);
    setWorkers((ws as any) || []);
  };
  useEffect(() => { load(); }, [supervisorId]);

  const workersOnSite = (areaId: string) =>
    workers.filter((w) => w.is_busy && w.current_supervisor_id === supervisorId && w.current_area_id === areaId);

  const openPicker = (areaId: string) => {
    const info = primaryMap[areaId];
    if (info && !info.isPrimary) {
      toast.error(`Read-only · Primary: ${info.primaryName || "—"}`);
      return;
    }
    setDraft(new Set(workersOnSite(areaId).map((w) => w.id)));
    setQuery("");
    setOpenArea(areaId);
  };

  const toggle = (wid: string) => setDraft((s) => {
    const n = new Set(s); n.has(wid) ? n.delete(wid) : n.add(wid); return n;
  });

  const save = async () => {
    if (!supervisorId || !openArea) return;
    setSubmitting(true);
    try {
      const before = new Set(workersOnSite(openArea).map((w) => w.id));
      const toAdd = [...draft].filter((x) => !before.has(x));
      if (toAdd.length) {
        const { error } = await supabase.from("workers").update({
          is_busy: true, current_supervisor_id: supervisorId, current_area_id: openArea,
          current_line_item_id: null,
        }).in("id", toAdd);
        if (error) { toast.error(error.message); return; }
        // also record in sup_daily_roster for carry-over tracking
        const today = new Date().toISOString().slice(0, 10);
        for (const wid of toAdd) {
          await supabase.from("sup_daily_roster").upsert(
            { supervisor_id: supervisorId, worker_id: wid, work_date: today },
            { onConflict: "supervisor_id,work_date,worker_id" } as any
          );
        }
      }
      // Release is only allowed from Team Today — never remove from here.
      toast.success(`+${toAdd.length}`);
      setOpenArea(null);
      await load();
    } finally { setSubmitting(false); }
  };

  const pickerGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const m = new Map<string, Worker[]>();
    workers.forEach((w) => {
      if (q && !w.name.toLowerCase().includes(q) && !(w.designation || "").toLowerCase().includes(q)) return;
      const k = w.contractor_id || "__none";
      m.set(k, [...(m.get(k) || []), w]);
    });
    return Array.from(m.entries())
      .map(([k, list]) => ({
        key: k,
        name: k === "__none" ? "—" : (contractors[k] || "—"),
        list: list.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [workers, contractors, query]);

  if (!supervisorId) {
    return <Card className="p-6 text-center text-muted-foreground text-sm"><L k="pick_supervisor" /></Card>;
  }

  return (
    <div className="space-y-3 pb-24">
      <Card className="p-3 flex items-center gap-2">
        <MapPin className="h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold"><L k="assign" layout="inline" /></div>
          <div className="text-xs text-muted-foreground">Tap a site → pick workers</div>
        </div>
      </Card>

      {mySites.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm"><L k="no_sites_assigned" /></Card>
      ) : (
        <div className="space-y-2">
          {mySites.map((s) => {
            const on = workersOnSite(s.areaId);
            const info = primaryMap[s.areaId];
            const isPrimary = !info || info.isPrimary; // default true if unknown
            return (
              <Card
                key={s.areaId}
                className={`p-3 space-y-2 transition-colors border-l-4 ${
                  isPrimary
                    ? "border-l-role-primary cursor-pointer hover:bg-accent/40"
                    : "border-l-role-assist bg-muted/30"
                }`}
                onClick={() => isPrimary && openPicker(s.areaId)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="default" className="text-sm">📍 {s.name}</Badge>
                  {isPrimary ? (
                    <Badge className="bg-role-primary hover:bg-role-primary text-white text-[10px] px-1.5 py-0">PRIMARY</Badge>
                  ) : (
                    <Badge variant="outline" className="border-role-assist text-role-assist text-[10px] px-1.5 py-0">
                      <Lock className="h-3 w-3 mr-1" /> Assist
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{on.length} worker(s)</span>
                </div>
                {!isPrimary && (
                  <div className="text-[11px] text-muted-foreground">
                    Read-only · Primary: <b>{info?.primaryName || "—"}</b>
                  </div>
                )}
                {isPrimary && on.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-primary">
                    <Users className="h-4 w-4" /> Tap to add workers
                  </div>
                ) : on.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {on.map((w) => (
                      <Badge key={w.id} variant="secondary" className="text-[11px]">{w.name}</Badge>
                    ))}
                    {isPrimary && <Badge variant="outline" className="text-[11px]">+ Edit</Badge>}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!openArea} onOpenChange={(o) => !o && setOpenArea(null)}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm leading-snug break-words">
              📍 {openArea ? (areas[openArea] || "—") : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name…"
              className="pl-8 h-9"
            />
          </div>
          <div className="overflow-y-auto flex-1 -mx-2 px-2 space-y-3">
            {pickerGroups.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-6">No matches</div>
            )}
            {pickerGroups.map((g) => (
              <div key={g.key} className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground sticky top-0 bg-background py-1">
                  {g.name}
                </div>
                {g.list.map((w) => {
                  const here = w.is_busy && w.current_supervisor_id === supervisorId && w.current_area_id === openArea;
                  const elsewhere = w.is_busy && !here;
                  const checked = draft.has(w.id);
                  const locked = here; // already assigned to this site — cannot untick here
                  const where = elsewhere
                    ? `On: ${areas[w.current_area_id || ""] || "—"} · ${sups[w.current_supervisor_id || ""] || "—"}`
                    : null;
                  return (
                    <label
                      key={w.id}
                      className={`flex items-center gap-2 p-2 rounded border min-h-[48px] ${
                        elsewhere ? "opacity-60 cursor-not-allowed bg-muted/30" :
                        locked ? "bg-emerald-500/10 border-emerald-500/40 cursor-not-allowed" :
                        checked ? "bg-primary/10 border-primary cursor-pointer" :
                        "hover:bg-accent/40 cursor-pointer"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={elsewhere || locked}
                        onCheckedChange={() => !elsewhere && !locked && toggle(w.id)}
                        className="h-5 w-5"
                      />
                      <EmployeePhoto path={w.photo_url} name={w.name} subtitle={w.designation} />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-medium leading-tight ${locked ? "text-muted-foreground" : ""}`}>{w.name}</div>
                        <div className="text-[11px] text-muted-foreground break-words">
                          {w.designation}
                          {locked && <> · <span className="text-emerald-700"><L k="already_assigned" oneLine /> · <L k="release_from_team_today" oneLine /></span></>}
                          {elsewhere && <> · <span className="text-amber-600">{where}</span></>}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpenArea(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={save} disabled={submitting}>{submitting ? "…" : `Save (${draft.size})`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
