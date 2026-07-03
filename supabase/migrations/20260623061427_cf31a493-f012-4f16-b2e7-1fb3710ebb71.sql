
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS purchase_orders_site_id_idx
  ON public.purchase_orders(site_id);

UPDATE public.purchase_orders po
   SET site_id = s.id
  FROM public.sites s
 WHERE po.site_id IS NULL
   AND po.client_id IS NOT NULL
   AND s.client_id = po.client_id
   AND lower(trim(s.name)) = lower(trim(po.site));
