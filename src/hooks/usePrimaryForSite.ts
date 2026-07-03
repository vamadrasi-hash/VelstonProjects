import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PrimaryInfo = { isPrimary: boolean; primaryName: string | null };

/**
 * Returns primary info per area_id for the given supervisor.
 * A supervisor is "primary" for an area if any site_assignment on that area
 * has primary_supervisor_id === supervisorId.
 */
export function usePrimaryForSite(supervisorId: string | null | undefined) {
  const [map, setMap] = useState<Record<string, PrimaryInfo>>({});

  useEffect(() => {
    if (!supervisorId) { setMap({}); return; }
    (async () => {
      const [{ data: sas }, { data: sups }] = await Promise.all([
        supabase.from("site_assignments").select("area_id,primary_supervisor_id"),
        supabase.from("supervisors").select("id,name"),
      ]);
      const nameOf: Record<string, string> = {};
      ((sups as any) || []).forEach((s: any) => (nameOf[s.id] = s.name));
      const out: Record<string, PrimaryInfo> = {};
      ((sas as any) || []).forEach((s: any) => {
        if (!s.area_id) return;
        const cur = out[s.area_id];
        const isMine = s.primary_supervisor_id === supervisorId;
        const name = s.primary_supervisor_id ? (nameOf[s.primary_supervisor_id] || null) : null;
        if (!cur) out[s.area_id] = { isPrimary: isMine, primaryName: name };
        else if (isMine) out[s.area_id] = { isPrimary: true, primaryName: name };
      });
      setMap(out);
    })();
  }, [supervisorId]);

  return map;
}
