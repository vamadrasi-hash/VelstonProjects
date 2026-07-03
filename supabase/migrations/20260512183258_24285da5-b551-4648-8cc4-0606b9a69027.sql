
-- Split assignments table
CREATE TABLE public.line_item_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id uuid NOT NULL,
  supervisor_id uuid NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.line_item_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY demo_all_select ON public.line_item_assignments FOR SELECT USING (true);
CREATE POLICY demo_all_insert ON public.line_item_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY demo_all_update ON public.line_item_assignments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY demo_all_delete ON public.line_item_assignments FOR DELETE USING (true);

CREATE INDEX idx_lia_line_item ON public.line_item_assignments(line_item_id);
CREATE INDEX idx_lia_supervisor ON public.line_item_assignments(supervisor_id);

-- Validation trigger: total assigned never exceeds line item quantity
CREATE OR REPLACE FUNCTION public.validate_line_item_assignment()
RETURNS TRIGGER AS $$
DECLARE
  total_qty numeric;
  assigned_qty numeric;
BEGIN
  SELECT quantity INTO total_qty FROM public.po_line_items WHERE id = NEW.line_item_id;
  IF total_qty IS NULL THEN
    RAISE EXCEPTION 'Line item not found';
  END IF;
  SELECT COALESCE(SUM(quantity),0) INTO assigned_qty
    FROM public.line_item_assignments
    WHERE line_item_id = NEW.line_item_id
      AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF assigned_qty + NEW.quantity > total_qty THEN
    RAISE EXCEPTION 'Assignment (%) exceeds remaining quantity. Total: %, already assigned: %',
      NEW.quantity, total_qty, assigned_qty;
  END IF;
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_lia
BEFORE INSERT OR UPDATE ON public.line_item_assignments
FOR EACH ROW EXECUTE FUNCTION public.validate_line_item_assignment();

-- Backfill from existing single-supervisor assignments
INSERT INTO public.line_item_assignments (line_item_id, supervisor_id, quantity)
SELECT id, supervisor_id, quantity
FROM public.po_line_items
WHERE supervisor_id IS NOT NULL AND quantity > 0;

-- Indexes for daily_logs date filtering
CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON public.daily_logs(date);
CREATE INDEX IF NOT EXISTS idx_daily_logs_sup_date ON public.daily_logs(supervisor_id, date);
