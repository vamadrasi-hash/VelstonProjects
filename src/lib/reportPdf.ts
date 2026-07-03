// Admin daily report PDF
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ReportRow = {
  date: string;
  site: string;
  contractor: string;
  worker: string;
  designation: string;
  supervisor: string;
  task: string;
  days: number;
  hours: number;
  workDone: number;
  uom: string;
  workerRs: number;
  contractorRs: number;
  totalRs: number;
  photosBefore: number;
  photosAfter: number;
  // IDs for reliable joins (e.g. photo lookup); not rendered in PDFs.
  supervisorId?: string | null;
  workerId?: string | null;
};

export type PhotoRef = {
  date: string; site: string; contractor: string; worker: string;
  supervisor?: string; task?: string;
  kind: "before" | "after"; url: string;
  lat: number | null; lng: number | null; acc: number | null;
  capturedAt: string | null;
};

const fmtFilter = (f: {
  from: string; to: string; sites: string[]; contractors: string[]; supervisors: string[];
}) => {
  const parts = [`${f.from} → ${f.to}`];
  if (f.sites.length) parts.push(`Sites: ${f.sites.join(", ")}`);
  if (f.contractors.length) parts.push(`Contractors: ${f.contractors.join(", ")}`);
  if (f.supervisors.length) parts.push(`Supervisors: ${f.supervisors.join(", ")}`);
  return parts.join(" · ");
};

export function buildSummaryPdf(
  rows: ReportRow[],
  filter: { from: string; to: string; sites: string[]; contractors: string[]; supervisors: string[] },
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text("Daily Work Report", pageW / 2, 32, { align: "center" });
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(fmtFilter(filter), pageW / 2, 48, { align: "center" });

  autoTable(doc, {
    startY: 60, styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [40, 40, 40] },
    head: [["Date", "Site", "Contractor", "Worker", "Designation", "Supervisor", "Task", "Days", "Hrs", "Done", "Worker ₹", "Contr ₹", "Total ₹", "B/A"]],
    body: rows.map((r) => [
      r.date, r.site, r.contractor, r.worker, r.designation, r.supervisor, r.task,
      r.days.toFixed(2), r.hours.toFixed(1),
      `${r.workDone.toFixed(1)} ${r.uom}`,
      r.workerRs.toFixed(0), r.contractorRs.toFixed(0), r.totalRs.toFixed(0),
      `${r.photosBefore}/${r.photosAfter}`,
    ]),
    foot: [[
      "", "", "", "", "", "", "TOTAL", "", "",
      "",
      rows.reduce((s, r) => s + r.workerRs, 0).toFixed(0),
      rows.reduce((s, r) => s + r.contractorRs, 0).toFixed(0),
      rows.reduce((s, r) => s + r.totalRs, 0).toFixed(0),
      "",
    ]],
    footStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: "bold" },
  });
  doc.save(`daily-report-${filter.from}_to_${filter.to}.pdf`);
}

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });

export async function buildFullPdf(
  rows: ReportRow[],
  photos: PhotoRef[],
  filter: { from: string; to: string; sites: string[]; contractors: string[]; supervisors: string[] },
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text("Daily Work Report — Full", pageW / 2, 32, { align: "center" });
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(fmtFilter(filter), pageW / 2, 48, { align: "center" });

  autoTable(doc, {
    startY: 60, styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [40, 40, 40] },
    head: [["Date", "Site", "Contractor", "Worker", "Task", "Days", "Hrs", "Done", "₹ Total"]],
    body: rows.map((r) => [
      r.date, r.site, r.contractor, r.worker, r.task,
      r.days.toFixed(2), r.hours.toFixed(1),
      `${r.workDone.toFixed(1)} ${r.uom}`, r.totalRs.toFixed(0),
    ]),
  });

  if (photos.length === 0) { doc.save(`daily-report-full-${filter.from}_to_${filter.to}.pdf`); return; }

  // Group photos: supervisor → site → task → date
  type Group = {
    supervisor: string; site: string; task: string; date: string;
    workers: Set<string>; before: PhotoRef[]; after: PhotoRef[];
  };
  const groups = new Map<string, Group>();
  for (const p of photos) {
    const sup = p.supervisor || "—";
    const task = p.task || "—";
    const key = `${sup}||${p.site}||${task}||${p.date}`;
    let g = groups.get(key);
    if (!g) {
      g = { supervisor: sup, site: p.site, task, date: p.date, workers: new Set(), before: [], after: [] };
      groups.set(key, g);
    }
    if (p.worker && p.worker !== "(photos only)") g.workers.add(p.worker);
    (p.kind === "before" ? g.before : g.after).push(p);
  }
  // Also collect workers from rows that may not have photos but match a group.
  for (const r of rows) {
    const key = `${r.supervisor}||${r.site}||${r.task}||${r.date}`;
    const g = groups.get(key);
    if (g && r.worker && r.worker !== "(photos only)") g.workers.add(r.worker);
  }

  const sorted = Array.from(groups.values()).sort((a, b) =>
    a.date.localeCompare(b.date) || a.supervisor.localeCompare(b.supervisor) ||
    a.site.localeCompare(b.site) || a.task.localeCompare(b.task),
  );

  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const colGap = 16;
  const colW = (pageW - margin * 2 - colGap) / 2;
  const thumbW = (colW - 8) / 2; // 2 thumbs per column row
  const thumbH = 90;
  const captionH = 20;

  let first = true;
  for (const g of sorted) {
    if (g.before.length === 0 && g.after.length === 0) continue;
    doc.addPage(); first = false;
    let y = margin;

    // Header block
    doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text(`Supervisor: ${g.supervisor}`, margin, y); y += 14;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`Site: ${g.site}`, margin, y); y += 13;
    const taskLines = doc.splitTextToSize(`Work: ${g.task}`, pageW - margin * 2);
    doc.text(taskLines, margin, y); y += 13 * taskLines.length;
    doc.text(`Date: ${g.date}`, margin, y); y += 13;
    const workerList = Array.from(g.workers).sort().join(", ") || "—";
    const wLines = doc.splitTextToSize(`Workers: ${workerList}`, pageW - margin * 2);
    doc.text(wLines, margin, y); y += 13 * wLines.length + 6;

    // Column headers
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.setFillColor(245, 158, 11); // amber for BEFORE
    doc.rect(margin, y, colW, 16, "F");
    doc.setFillColor(16, 185, 129); // emerald for AFTER
    doc.rect(margin + colW + colGap, y, colW, 16, "F");
    doc.setTextColor(255, 255, 255);
    doc.text("BEFORE", margin + 6, y + 12);
    doc.text("AFTER", margin + colW + colGap + 6, y + 12);
    doc.setTextColor(0, 0, 0);
    y += 22;

    const startY = y;
    // Render thumbs in two columns independently.
    const renderColumn = async (list: PhotoRef[], xStart: number) => {
      let cy = startY;
      let cx = xStart;
      let placed = 0;
      for (const p of list) {
        if (cy + thumbH + captionH > pageH - margin) {
          // new page, repeat header strip
          doc.addPage();
          cy = margin;
          cx = xStart;
          placed = 0;
        }
        try {
          const img = await loadImage(p.url);
          const ratio = img.naturalWidth / img.naturalHeight || 1;
          let w = thumbW, h = thumbW / ratio;
          if (h > thumbH) { h = thumbH; w = thumbH * ratio; }
          const ox = cx + (thumbW - w) / 2;
          const oy = cy + (thumbH - h) / 2;
          doc.addImage(img, "JPEG", ox, oy, w, h, undefined, "FAST");
        } catch { /* skip */ }
        doc.setFontSize(7); doc.setFont("helvetica", "normal");
        const gps = (p.lat != null && p.lng != null)
          ? `${p.lat.toFixed(5)},${p.lng.toFixed(5)} (±${p.acc?.toFixed(0) || "?"}m)`
          : "";
        const cap = [p.date, gps].filter(Boolean).join(" · ");
        doc.text(cap, cx, cy + thumbH + 9, { maxWidth: thumbW });
        placed += 1;
        if (placed % 2 === 0) {
          cx = xStart;
          cy += thumbH + captionH;
        } else {
          cx = xStart + thumbW + 8;
        }
      }
    };
    await renderColumn(g.before, margin);
    await renderColumn(g.after, margin + colW + colGap);
  }
  if (first) { /* nothing rendered */ }
  doc.save(`daily-report-full-${filter.from}_to_${filter.to}.pdf`);
}
