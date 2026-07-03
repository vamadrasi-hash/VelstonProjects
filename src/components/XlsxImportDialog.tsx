import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseXlsx, downloadXlsx, downloadXlsxTemplate, type XlsxRow } from "@/lib/xlsx";

type Field = { key: string; required?: boolean };

type Props = {
  table: string;
  templateName: string;
  fields: Field[];
  /** Map a CSV/XLSX row to a DB row. Return null to skip; throw to mark invalid. */
  mapRow: (row: XlsxRow, idx: number) => Promise<Record<string, any> | null> | Record<string, any> | null;
  sample?: string[][];
  onDone?: () => void;
  label?: string;
};

export function XlsxImportDialog({ table, templateName, fields, mapRow, sample, onDone, label = "Import Excel" }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<XlsxRow[]>([]);
  const [valid, setValid] = useState<Record<string, any>[]>([]);
  const [invalid, setInvalid] = useState<{ row: XlsxRow; reason: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRows([]); setValid([]); setInvalid([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (f: File) => {
    try {
      const parsed = await parseXlsx(f);
      const v: Record<string, any>[] = [];
      const bad: typeof invalid = [];
      for (let i = 0; i < parsed.length; i++) {
        const r = parsed[i];
        let missing = false;
        for (const fl of fields) {
          if (fl.required && !r[fl.key]) { bad.push({ row: r, reason: `Missing ${fl.key}` }); missing = true; break; }
        }
        if (missing) continue;
        try {
          const mapped = await mapRow(r, i);
          if (mapped) v.push(mapped);
        } catch (e: any) {
          bad.push({ row: r, reason: e.message || "Invalid row" });
        }
      }
      setRows(parsed); setValid(v); setInvalid(bad);
    } catch (e: any) {
      toast.error("Failed to parse file: " + e.message);
    }
  };

  const doImport = async () => {
    if (!valid.length) return toast.error("No valid rows");
    setBusy(true);
    let inserted = 0;
    const failed: { row: any; error: string }[] = [];
    for (let i = 0; i < valid.length; i += 200) {
      const chunk = valid.slice(i, i + 200);
      const { error } = await supabase.from(table as any).insert(chunk);
      if (error) {
        for (const r of chunk) {
          const { error: e2 } = await supabase.from(table as any).insert(r);
          if (e2) failed.push({ row: r, error: e2.message });
          else inserted++;
        }
      } else inserted += chunk.length;
    }
    setBusy(false);
    toast.success(`Imported ${inserted}. Skipped ${invalid.length}. Failed ${failed.length}.`);
    if (failed.length) downloadXlsx(`${table}-errors.xlsx`, failed.map((f) => ({ ...f.row, _error: f.error })));
    setOpen(false); reset(); onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Upload className="h-4 w-4" />{label}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Button type="button" variant="ghost" size="sm"
              onClick={() => downloadXlsxTemplate(templateName, fields.map((f) => f.key), sample)}>
              <Download className="h-4 w-4" />Download template
            </Button>
            <input
              ref={fileRef} type="file" accept=".xlsx,.xls"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              className="text-sm"
            />
          </div>
          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm">
                <span className="text-emerald-600 font-medium">{valid.length} valid</span>
                {invalid.length > 0 && <> · <span className="text-destructive">{invalid.length} invalid</span></>}
                · {rows.length} total
              </div>
              <div className="max-h-64 overflow-auto border rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>{fields.map((f) => <th key={f.key} className="px-2 py-1 text-left">{f.key}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 20).map((r, i) => (
                      <tr key={i} className="border-t">
                        {fields.map((f) => <td key={f.key} className="px-2 py-1">{r[f.key]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 20 && <div className="p-2 text-xs text-muted-foreground">…and {rows.length - 20} more</div>}
              </div>
              {invalid.length > 0 && (
                <div className="text-xs text-destructive max-h-24 overflow-auto">
                  {invalid.slice(0, 5).map((x, i) => <div key={i}>Row: {Object.values(x.row).join(", ")} — {x.reason}</div>)}
                </div>
              )}
            </div>
          )}
          {!rows.length && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" /> Pick an Excel file to preview before importing.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={doImport} disabled={!valid.length || busy}>
            {busy ? "Importing…" : `Import ${valid.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
