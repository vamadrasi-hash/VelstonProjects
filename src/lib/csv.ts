import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";

export type CsvRow = Record<string, string>;

export const parseCsv = (file: File) =>
  new Promise<CsvRow[]>((resolve, reject) => {
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (r) => resolve(r.data.map((row) => {
        const out: CsvRow = {};
        for (const k of Object.keys(row)) out[k] = (row[k] ?? "").toString().trim();
        return out;
      })),
      error: reject,
    });
  });

export const downloadTemplate = (filename: string, headers: string[], sample: string[][] = []) => {
  const csv = Papa.unparse({ fields: headers, data: sample });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

export const downloadCsv = (filename: string, rows: any[]) => {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

export const batchInsert = async (table: string, rows: any[], size = 500) => {
  let inserted = 0;
  const failed: { row: any; error: string }[] = [];
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error, count } = await supabase.from(table as any).insert(chunk, { count: "exact" });
    if (error) {
      // try one by one to surface bad rows
      for (const r of chunk) {
        const { error: e2 } = await supabase.from(table as any).insert(r);
        if (e2) failed.push({ row: r, error: e2.message });
        else inserted++;
      }
    } else {
      inserted += count ?? chunk.length;
    }
  }
  return { inserted, failed };
};
