// PO PDF generator. Internal data still uses `site` (work order) and `area` (site);
// the document presents them with the new external terminology: Work Order / Site.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type PO = {
  po_number: string | null;
  client_name: string;
  site: string;
  doc_date: string;
};
type LineItem = {
  id: string;
  description: string;
  uom: string;
  quantity: number;
  rate?: number | null;
  amendment_serial: number;
  source_quotation_id: string | null;
};
type Quotation = { id: string; doc_date: string };

const serialStr = (n: number) => String(n).padStart(5, "0");

export function generatePoPdf(po: PO, items: LineItem[], quotations: Record<string, Quotation>, opts: { autoSave?: boolean; print?: boolean } = {}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("PURCHASE ORDER", pageW / 2, 40, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  let y = 70;
  doc.text(`PO Number: ${po.po_number || "(no #)"}`, 40, y);
  doc.text(`Date: ${po.doc_date || ""}`, pageW - 40, y, { align: "right" });
  y += 16;
  doc.text(`Client: ${po.client_name || ""}`, 40, y);
  y += 16;
  doc.text(`Work Order: ${po.site || ""}`, 40, y);
  y += 10;

  // Group items by amendment_serial
  const groups = new Map<number, LineItem[]>();
  items.forEach((it) => {
    const k = it.amendment_serial ?? 10;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
  });
  const sortedSerials = Array.from(groups.keys()).sort((a, b) => a - b);

  let cursor = y + 6;
  let grandTotal = 0;

  sortedSerials.forEach((serial, idx) => {
    const groupItems = groups.get(serial)!;
    const isOriginal = idx === 0;
    const sourceQ = groupItems[0].source_quotation_id ? quotations[groupItems[0].source_quotation_id] : null;
    const headerLabel = `${isOriginal ? "Original" : "Amendment"} · ${serialStr(serial)}${sourceQ ? ` · Quotation ${sourceQ.doc_date || ""}` : ""}`;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(headerLabel, 40, cursor + 14);
    cursor += 18;

    const body = groupItems.map((it, i) => {
      const rate = Number(it.rate || 0);
      const amount = Number(it.quantity) * rate;
      grandTotal += amount;
      return [
        String(i + 1),
        it.description,
        it.uom,
        String(it.quantity),
        rate ? rate.toFixed(2) : "",
        rate ? amount.toFixed(2) : "",
      ];
    });

    autoTable(doc, {
      head: [["#", "Description", "UoM", "Qty", "Rate (Rs.)", "Amount (Rs.)"]],
      body,
      startY: cursor,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 260 },
        2: { cellWidth: 50 },
        3: { cellWidth: 50, halign: "right" },
        4: { cellWidth: 60, halign: "right" },
        5: { cellWidth: 70, halign: "right" },
      },
      margin: { left: 40, right: 40 },
    });
    // @ts-expect-error - lastAutoTable is attached by jspdf-autotable
    cursor = doc.lastAutoTable.finalY + 12;
  });

  if (grandTotal > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Grand Total: Rs. ${grandTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`, pageW - 40, cursor + 4, { align: "right" });
  }

  const filename = `PO-${po.po_number || "draft"}.pdf`;
  if (opts.print) {
    doc.autoPrint();
    const url = doc.output("bloburl");
    window.open(url, "_blank");
  } else if (opts.autoSave !== false) {
    doc.save(filename);
  }
  return doc;
}
