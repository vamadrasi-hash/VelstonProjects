
ALTER TABLE public.po_line_items
  ADD COLUMN IF NOT EXISTS source_quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_quotation_item_id uuid REFERENCES public.quotation_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amendment_serial integer NOT NULL DEFAULT 10;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS merged_po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amendment_serial integer;

-- Back-fill source_quotation_id from purchase_orders.quotation_id for existing rows
UPDATE public.po_line_items pli
SET source_quotation_id = po.quotation_id
FROM public.purchase_orders po
WHERE pli.po_id = po.id
  AND pli.source_quotation_id IS NULL
  AND po.quotation_id IS NOT NULL;

-- Best-effort back-fill of source_quotation_item_id by matching description + uom + quantity within the same quotation
UPDATE public.po_line_items pli
SET source_quotation_item_id = qi.id
FROM public.quotation_items qi
WHERE pli.source_quotation_item_id IS NULL
  AND pli.source_quotation_id = qi.quotation_id
  AND pli.description = qi.description
  AND pli.uom = qi.uom
  AND pli.quantity = qi.quantity;

CREATE INDEX IF NOT EXISTS po_line_items_source_quotation_id_idx ON public.po_line_items(source_quotation_id);
CREATE INDEX IF NOT EXISTS po_line_items_amendment_serial_idx ON public.po_line_items(po_id, amendment_serial);
CREATE INDEX IF NOT EXISTS quotations_merged_po_id_idx ON public.quotations(merged_po_id);
