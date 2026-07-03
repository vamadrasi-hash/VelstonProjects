
-- Wipe transactional data
DELETE FROM public.daily_log_edits;
DELETE FROM public.daily_logs;
DELETE FROM public.line_item_assignments;
DELETE FROM public.site_assignment_items;
DELETE FROM public.site_assignments;

ALTER SEQUENCE public.assignment_number_seq RESTART WITH 1;
ALTER SEQUENCE public.site_assignment_number_seq RESTART WITH 1;

-- Replace policy that references purchase_orders.site_id
DROP POLICY IF EXISTS "sup read assigned clients" ON public.clients;
CREATE POLICY "sup read assigned clients" ON public.clients
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  AND id IN (
    SELECT po.client_id
    FROM purchase_orders po
    JOIN po_line_items li ON li.po_id = po.id
    JOIN line_item_assignments la ON la.line_item_id = li.id
    WHERE la.supervisor_id IN (SELECT id FROM supervisors WHERE user_id = auth.uid())
  )
);

-- Schema changes
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sites_po_id_idx ON public.sites(po_id);

ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS site_id;
