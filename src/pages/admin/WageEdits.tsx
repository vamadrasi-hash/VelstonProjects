import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";

type Edit = {
  id: string; daily_log_id: string | null; action: string;
  before_data: any; after_data: any;
  edited_by: string | null; edited_at: string;
};

export default function WageEdits() {
  const [rows, setRows] = useState<Edit[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("daily_log_edits").select("*").order("edited_at", { ascending: false }).limit(200);
      setRows((data as any) || []);
    })();
  }, []);

  const diff = (b: any, a: any) => {
    if (!a) return "(deleted)";
    if (!b) return "(created)";
    const keys = ["wage_scale", "hours", "total_wages", "contractor_share", "work_done", "remark"];
    return keys
      .filter((k) => String(b?.[k]) !== String(a?.[k]))
      .map((k) => `${k}: ${b?.[k]} → ${a?.[k]}`).join(" · ") || "(no change)";
  };

  return (
    <div className="space-y-3 max-w-4xl">
      <h2 className="text-xl font-semibold">Wage Entry Edit Log</h2>
      <div className="text-xs text-muted-foreground">Latest {rows.length} changes.</div>
      <div className="grid gap-2">
        {rows.map((r) => (
          <Card key={r.id} className="p-3 text-sm space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={r.action === "delete" ? "destructive" : "secondary"} className="capitalize">{r.action}</Badge>
              <span className="text-xs text-muted-foreground">{fmtDateTime(r.edited_at)}</span>
              <span className="text-xs text-muted-foreground">log: {r.daily_log_id?.slice(0, 8)}…</span>
            </div>
            <div className="text-xs">{diff(r.before_data, r.after_data)}</div>
          </Card>
        ))}
        {rows.length === 0 && <div className="text-sm text-muted-foreground">No edits recorded yet.</div>}
      </div>
    </div>
  );
}
