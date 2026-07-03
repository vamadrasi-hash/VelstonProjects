import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Option } from "@/components/SearchableSelect";

const fetchAll = async (table: string, fields = "id,name") => {
  const { data, error } = await supabase.from(table as any).select(fields).order(fields.split(",")[1] || "name");
  if (error) throw error;
  return data || [];
};

export const useMaster = <T = any>(table: string, fields = "id,name") =>
  useQuery<T[]>({ queryKey: ["master", table, fields], queryFn: () => fetchAll(table, fields) as any });

export const useInvalidateMaster = () => {
  const qc = useQueryClient();
  return (table: string) => qc.invalidateQueries({ queryKey: ["master", table] });
};

/** Helper: create a row in a master and return Option. Used by SearchableSelect.onCreate. */
export const createMaster = async (
  table: string,
  payload: Record<string, any>,
  labelField = "name"
): Promise<Option | null> => {
  const { data, error } = await supabase.from(table as any).insert(payload).select().single();
  if (error || !data) return null;
  return { value: (data as any).id, label: (data as any)[labelField] };
};

export const toOptions = (rows: any[], labelField = "name", subField?: string): Option[] =>
  rows.map((r) => ({
    value: r.id,
    label: r[labelField] ?? r.code ?? "",
    sublabel: subField ? r[subField] : undefined,
  }));
