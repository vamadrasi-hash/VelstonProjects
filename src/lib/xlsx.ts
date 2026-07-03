import * as XLSX from "xlsx";

export type XlsxRow = Record<string, string>;

export const parseXlsx = (file: File): Promise<XlsxRow[]> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const wb = XLSX.read(r.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "", raw: false });
        const out: XlsxRow[] = rows.map((row) => {
          const o: XlsxRow = {};
          for (const k of Object.keys(row)) o[k.trim().toLowerCase()] = String(row[k] ?? "").trim();
          return o;
        });
        resolve(out);
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = reject;
    r.readAsBinaryString(file);
  });

export const downloadXlsx = async (filename: string, rows: any[], sheetName = "Sheet1") => {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  // Modern desktop browsers (Chrome/Edge): show native "Save As" dialog so user picks folder + name.
  const anyWin = window as any;
  if (typeof anyWin.showSaveFilePicker === "function") {
    try {
      const handle = await anyWin.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: "Excel Workbook",
          accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e: any) {
      // User cancelled → bail silently. Other errors → fall back to anchor download.
      if (e?.name === "AbortError") return;
    }
  }

  // Fallback (Safari, Firefox, mobile, sandboxed iframes): browser's default Downloads folder.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};


export const downloadXlsxTemplate = (
  filename: string,
  headers: string[],
  sample: string[][] = [],
) => {
  const rows = sample.map((s) => {
    const o: any = {};
    headers.forEach((h, i) => (o[h] = s[i] ?? ""));
    return o;
  });
  if (rows.length === 0) {
    const empty: any = {};
    headers.forEach((h) => (empty[h] = ""));
    rows.push(empty);
  }
  downloadXlsx(filename, rows);
};
