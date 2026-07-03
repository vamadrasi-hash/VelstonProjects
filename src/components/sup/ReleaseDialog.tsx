import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { L, tx } from "@/components/BilingualLabel";
import { toast } from "sonner";

export type ReleaseTarget = {
  rosterId: string;
  workerId: string;
  workerName: string;
  defaultDate: string;
  defaultWage: number;
  supervisorId: string;
  contractorId: string | null;
  mode?: "release" | "continue";
  todayDate?: string;
  askReason?: boolean;
};

const REASONS = [
  { v: "mistake", k: "selected_by_mistake" },
  { v: "absent", k: "absent" },
  { v: "no_work", k: "no_work_today" },
  { v: "other", k: "other" },
];

export function ReleaseDialog({
  target, onClose, onDone,
}: { target: ReleaseTarget | null; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState("");
  const [days, setDays] = useState("1");
  const [hours, setHours] = useState("0");
  const [reason, setReason] = useState("mistake");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) {
      setDate(target.defaultDate);
      // Carry-over actions default to 1 day; today's release defaults to 0
      setDays(target.askReason ? "0" : "1");
      setHours("0");
      setReason("mistake");
      setOther("");
    }
  }, [target]);

  if (!target) return null;

  const askReason = !!target.askReason;

  const submit = async () => {
    let reasonText: string | null = null;
    if (askReason) {
      if (reason === "other" && !other.trim()) { toast.error(tx("reason_required")); return; }
      reasonText = reason === "other" ? other.trim() : tx(REASONS.find(r => r.v === reason)!.k);
    }
    const d = Number(days); const h = Number(hours);
    if (Number.isNaN(d) || Number.isNaN(h)) { toast.error("Invalid numbers"); return; }

    setBusy(true);
    try {
      const { data: existing } = await supabase.from("daily_logs")
        .select("id, total_wages, work_done, remark, contractor_share")
        .eq("supervisor_id", target.supervisorId)
        .eq("worker_id", target.workerId).eq("date", date).maybeSingle();
      const payload: any = existing
        ? {
            wage_scale: d, hours: h,
            zero_reason: reasonText,
          }
        : {
            supervisor_id: target.supervisorId, worker_id: target.workerId,
            contractor_id: target.contractorId, date,
            wage_scale: d, hours: h, total_wages: 0,
            work_done: 0, remark: "", contractor_share: 0,
            zero_reason: reasonText,
          };
      const res = existing
        ? await supabase.from("daily_logs").update(payload).eq("id", existing.id)
        : await supabase.from("daily_logs").insert(payload);
      if (res.error) { toast.error(res.error.message); return; }

      const { error } = await supabase.from("sup_daily_roster")
        .update({ released_at: new Date().toISOString(), release_reason: reasonText })
        .eq("id", target.rosterId);
      if (error) { toast.error(error.message); return; }

      if (target.mode === "continue") {
        const td = target.todayDate || new Date().toISOString().slice(0, 10);
        const { error: insErr } = await supabase.from("sup_daily_roster").insert({
          supervisor_id: target.supervisorId, worker_id: target.workerId, work_date: td,
        });
        if (insErr && !/duplicate/i.test(insErr.message)) { toast.error(insErr.message); return; }
        toast.success("Continued to today");
      } else {
        toast.success("Released");
      }
      onDone();
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {target.mode === "continue" ? <L k="continue_today" layout="inline" /> : <L k="release_worker" layout="inline" />}
          </AlertDialogTitle>
          <AlertDialogDescription>{target.workerName}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs"><L k="date_of_release" oneLine /></Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs"><L k="days" oneLine /></Label>
              <Input type="number" inputMode="decimal" min={0} step="0.5" value={days}
                onChange={(e) => setDays(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs"><L k="hours" oneLine /></Label>
              <Input type="number" inputMode="decimal" min={0} step="0.5" value={hours}
                onChange={(e) => setHours(e.target.value)} className="h-9" />
            </div>
          </div>
          {askReason && (
            <div>
              <Label className="text-xs"><L k="reason" oneLine /></Label>
              <RadioGroup value={reason} onValueChange={setReason} className="space-y-1 mt-1">
                {REASONS.map((o) => (
                  <div key={o.v} className="flex items-center gap-2">
                    <RadioGroupItem value={o.v} id={`rd-${o.v}`} />
                    <Label htmlFor={`rd-${o.v}`} className="text-sm"><L k={o.k} layout="inline" /></Label>
                  </div>
                ))}
              </RadioGroup>
              {reason === "other" && (
                <Textarea className="mt-2" placeholder={tx("reason_required")}
                  value={other} onChange={(e) => setOther(e.target.value)} />
              )}
            </div>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel><L k="cancel" oneLine /></AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); submit(); }} disabled={busy}>
            <L k="confirm" oneLine />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
