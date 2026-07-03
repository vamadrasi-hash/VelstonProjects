import { supabase } from "@/integrations/supabase/client";

/**
 * Expand supervisor "seat" rows from line_item_assignments into per-line-item tasks.
 * - A seat is a row with line_item_id = null and site_assignment_id set (new site-seat model).
 * - Legacy rows already have line_item_id set and are passed through as-is.
 *
 * For each seat, we look up site_assignment_items for its site_assignment_id and emit
 * one virtual row per linked po_line_item, carrying the Stage-1 quantity and
 * the seat's assignment_no / area_id.
 */
export type SeatRow = {
  id: string;
  supervisor_id?: string | null;
  line_item_id: string | null;
  site_assignment_id: string | null;
  area_id: string | null;
  quantity: number | null;
  assignment_no: string | null;
  parent_assignment_no: string | null;
  assigned_date?: string;
  [k: string]: any;
};

export type ExpandedRow = SeatRow & {
  line_item_id: string;
  quantity: number;
  po_line_items?: { description: string; uom: string; quantity?: number; purchase_orders?: any } | null;
};

export async function expandSeats(rows: SeatRow[]): Promise<ExpandedRow[]> {
  if (!rows || rows.length === 0) return [];
  const seatIds = rows.filter((r) => !r.line_item_id && r.site_assignment_id).map((r) => r.site_assignment_id!) as string[];
  const legacy = rows.filter((r) => r.line_item_id) as ExpandedRow[];

  if (seatIds.length === 0) return legacy;

  const uniqueSaIds = Array.from(new Set(seatIds));
  const { data: items } = await supabase
    .from("site_assignment_items")
    .select("site_assignment_id, po_line_item_id, quantity, po_line_items(description,uom,quantity,purchase_orders(site,client_name))")
    .in("site_assignment_id", uniqueSaIds);
  const { data: sas } = await supabase
    .from("site_assignments")
    .select("id, area_id")
    .in("id", uniqueSaIds);

  const saAreaMap: Record<string, string | null> = {};
  (sas || []).forEach((s: any) => (saAreaMap[s.id] = s.area_id || null));

  const bySa: Record<string, any[]> = {};
  (items || []).forEach((it: any) => {
    (bySa[it.site_assignment_id] ??= []).push(it);
  });

  const expanded: ExpandedRow[] = [];
  for (const seat of rows) {
    if (seat.line_item_id) continue;
    if (!seat.site_assignment_id) continue;
    const its = bySa[seat.site_assignment_id] || [];
    for (const it of its) {
      expanded.push({
        ...seat,
        id: `${seat.id}:${it.po_line_item_id}`,
        line_item_id: it.po_line_item_id,
        quantity: Number(it.quantity || 0),
        area_id: seat.area_id || saAreaMap[seat.site_assignment_id] || null,
        po_line_items: it.po_line_items || null,
      });
    }
  }

  return [...legacy, ...expanded];
}
