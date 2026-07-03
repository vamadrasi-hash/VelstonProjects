
-- areas
CREATE TABLE public.areas (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null,
  name text not null,
  created_at timestamptz not null default now()
);
CREATE INDEX idx_areas_site ON public.areas(site_id);
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_all_select ON public.areas FOR SELECT USING (true);
CREATE POLICY demo_all_insert ON public.areas FOR INSERT WITH CHECK (true);
CREATE POLICY demo_all_update ON public.areas FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY demo_all_delete ON public.areas FOR DELETE USING (true);

-- area_id on quotations / POs / line items
ALTER TABLE public.quotations ADD COLUMN area_id uuid;
ALTER TABLE public.purchase_orders ADD COLUMN area_id uuid;
ALTER TABLE public.po_line_items ADD COLUMN area_id uuid;

-- daily_logs progress + remark
ALTER TABLE public.daily_logs
  ADD COLUMN work_done numeric not null default 0,
  ADD COLUMN remark text not null default '';

-- soften validator: allow over-assignment, only block invalid qty
CREATE OR REPLACE FUNCTION public.validate_line_item_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;
  RETURN NEW;
END;
$function$;
