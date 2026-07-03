import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { L, tx } from "@/components/BilingualLabel";
import { EmployeePhoto } from "@/components/EmployeePhoto";
import { toast } from "sonner";
import { usePrimaryForSite } from "@/hooks/usePrimaryForSite";
import { Lock } from "lucide-react";

type Worker = {
  id: string; name: string; designation: string; photo_url: string | null;
  contractor_id: string | null;
  daily_rate: number; contractor_share_amount: number;
  current_supervisor_id: string | null; current_area_id: string | null;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Team() {
  const { supervisorId } = useRole();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [areas, setAreas] = useState<Record<string, string>>({});
  const [contractors, setContractors] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<Worker | null>(null);
  const [days, setDays] = useState("");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("mistake");
  const [otherText, setOtherText] = useState("");
  const [saving, setSaving] = useState(false);
  const primaryMap = usePrimaryForSite(supervisorId);

  const load = async () => {
    if (!supervisorId) return;
    const [{ data: ws }, { data: ars }, { data: cts }] = await Promise.all([
      supabase.from("workers").select("*").eq("is_busy", true).eq("current_supervisor_id", supervisorId),
      supabase.from("areas").select("id,name"),
      supabase.from("contractors").select("id,name"),
    ]);
    setWorkers((ws as any) || []);
    const am: Record<string, string> = {}; ((ars as any) || []).forEach((a: any) => (am[a.id] = a.name)); setAreas(am);
    const cm: Record<string, string> = {}; ((cts as any) || []).forEach((c: any) => (cm[c.id] = c.name)); setContractors(cm);
  };
  useEffect(() => { load(); }, [supervisorId]);

  const openRelease = (w: Worker) => {
    setTarget(w);
    setDays("");
    setHours("");
    setReason("mistake");
    setOtherText("");
  };

  const REASON_KEY: Record<string, string> = {
    mistake: "selected_by_mistake",
    absent: "absent",
    no_work: "no_work_today",
    other: "other",
  };

  const confirmRelease = async () => {
    if (!target || !supervisorId) return;
    if (days === "" || Number.isNaN(Number(days))) { toast.error(tx("days_required")); return; }
    if (hours === "" || Number.isNaN(Number(hours))) { toast.error(tx("hours_required")); return; }
    const d = Number(days), h = Number(hours);
    if (d < 0 || h < 0) { toast.error("Invalid"); return; }
    const zeroBoth = d === 0 && h === 0;
    let reasonText: string | null = null;
    if (zeroBoth) {
      if (reason === "other") {
        if (!otherText.trim()) { toast.error(tx("reason_required")); return; }
        reasonText = otherText.trim();
      } else {
        reasonText = tx(REASON_KEY[reason]);
      }
    }
    setSaving(true);
    try {
      const totalDays = d + h / 8;
      const rate = Number(target.daily_rate || 0);
      const share = totalDays * Number(target.contractor_share_amount || 0);
      const date = todayStr();
      const { data: existing } = await supabase.from("daily_logs")
        .select("id").eq("supervisor_id", supervisorId).eq("worker_id", target.id).eq("date", date).maybeSingle();
      const payload: any = {
        wage_scale: d, hours: h, total_wages: totalDays * rate, contractor_share: share,
        zero_reason: reasonText,
      };
      const res = existing
        ? await supabase.from("daily_logs").update(payload).eq("id", (existing as any).id)
        : await supabase.from("daily_logs").insert({
            ...payload, supervisor_id: supervisorId, worker_id: target.id,
            contractor_id: target.contractor_id, line_item_id: null, work_done: 0, remark: "", date,
          });
      if (res.error) { toast.error(res.error.message); return; }
      await supabase.from("sup_daily_roster")
        .update({ released_at: new Date().toISOString(), release_reason: reasonText })
        .eq("supervisor_id", supervisorId).eq("worker_id", target.id).eq("work_date", date);
      const { error } = await supabase.from("workers").update({
        is_busy: false, current_supervisor_id: null, current_area_id: null, current_line_item_id: null,
      }).eq("id", target.id);
      if (error) { toast.error(error.message); return; }
      toast.success(`Released ${target.name}`);
      setTarget(null);
      await load();
    } finally { setSaving(false); }
  };

  const bySite = useMemo(() => {
    const m = new Map<string, Worker[]>();
    workers.forEach((w) => {
      const k = w.current_area_id || "__none";
      m.set(k, [...(m.get(k) || []), w]);
    });
    return Array.from(m.entries()).map(([areaId, list]) => {
      const cmap = new Map<string, Worker[]>();
      list.forEach((w) => {
        const k = w.contractor_id || "__none";
        cmap.set(k, [...(cmap.get(k) || []), w]);
      });
      const groups = Array.from(cmap.entries()).map(([cid, ws]) => ({
        cid, name: cid === "__none" ? "—" : (contractors[cid] || "—"),
        list: ws.sort((a, b) => a.name.localeCompare(b.name)),
      })).sort((a, b) => a.name.localeCompare(b.name));
      return { areaId, name: areaId === "__none" ? "Unassigned" : (areas[areaId] || "—"), groups };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [workers, areas, contractors]);

  if (!supervisorId) {
    return <Card className="p-6 text-center text-muted-foreground text-sm"><L k="pick_supervisor" /></Card>;
  }

  const totalDaysPreview = Number(days || 0) + Number(hours || 0) / 8;
  const previewRs = totalDaysPreview * Number(target?.daily_rate || 0);

  return (
    <div className="space-y-3 pb-24">
      <Card className="p-3">
        <div className="font-semibold"><L k="todays_team" layout="inline" /></div>
        <div className="text-xs text-muted-foreground">{workers.length} worker(s) active</div>
      </Card>

      {bySite.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground text-sm"><L k="no_workers_today" /></Card>
      )}

      {bySite.map((s) => {
        const info = s.areaId === "__none" ? null : primaryMap[s.areaId];
        const isPrimary = !info || info.isPrimary;
        return (
        <Card key={s.areaId} className={`p-3 space-y-2 border-l-4 ${isPrimary ? "border-l-role-primary" : "border-l-role-assist"}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="default" className="text-sm">📍 {s.name}</Badge>
            {isPrimary
              ? <Badge className="bg-role-primary hover:bg-role-primary text-white text-[10px] px-1.5 py-0">PRIMARY</Badge>
              : <Badge variant="outline" className="border-role-assist text-role-assist text-[10px] px-1.5 py-0"><Lock className="h-3 w-3 mr-1" />Assist</Badge>}
          </div>
          {!isPrimary && (
            <div className="text-[11px] text-muted-foreground">Read-only · Primary: <b>{info?.primaryName || "—"}</b></div>
          )}
          {s.groups.map((g) => (
            <div key={g.cid} className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground">{g.name}</div>
              <div className="flex flex-wrap gap-2">
                {g.list.map((w) => (
                  <div key={w.id} className="flex items-center gap-2 border rounded p-2 bg-card min-w-[180px]">
                    <EmployeePhoto path={w.photo_url} name={w.name} subtitle={w.designation} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-tight">{w.name}</div>
                      <div className="text-[11px] text-muted-foreground">{w.designation}</div>
                    </div>
                    <Button size="sm" variant="outline" disabled={!isPrimary} onClick={() => openRelease(w)}>
                      <L k="release" oneLine />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Card>
        );
      })}

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle><L k="release_worker" layout="inline" /></AlertDialogTitle>
            <AlertDialogDescription>{target?.name}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] text-muted-foreground mb-1"><L k="days" oneLine /> *</div>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="h-10"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{[0,0.5,1,1.5,2,2.5,3].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-1"><L k="hours" oneLine /> *</div>
              <Select value={hours} onValueChange={setHours}>
                <SelectTrigger className="h-10"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{[0,1,2,3,4,5,6,7,8].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {days !== "" && hours !== "" && Number(days) === 0 && Number(hours) === 0 && (
            <div className="space-y-2">
              <div className="text-[11px] text-muted-foreground"><L k="release_reason" oneLine /> *</div>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mistake">{tx("selected_by_mistake")}</SelectItem>
                  <SelectItem value="absent">{tx("absent")}</SelectItem>
                  <SelectItem value="no_work">{tx("no_work_today")}</SelectItem>
                  <SelectItem value="other">{tx("other")}</SelectItem>
                </SelectContent>
              </Select>
              {reason === "other" && (
                <Textarea
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  placeholder={tx("reason_required")}
                  rows={2}
                />
              )}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Total days: <b>{totalDaysPreview.toFixed(2)}</b>
            {target?.daily_rate ? <> · ₹{previewRs.toFixed(0)}</> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}><L k="cancel" oneLine /></AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmRelease(); }}
              disabled={saving}
            >
              {saving ? "…" : <L k="confirm" oneLine />}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
