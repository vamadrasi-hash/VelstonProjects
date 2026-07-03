ALTER TABLE public.purchase_orders ADD COLUMN po_number text;
CREATE UNIQUE INDEX purchase_orders_po_number_key ON public.purchase_orders (po_number) WHERE po_number IS NOT NULL;