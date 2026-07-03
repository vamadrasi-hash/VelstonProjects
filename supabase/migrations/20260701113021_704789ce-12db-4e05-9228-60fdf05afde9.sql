
-- Allow site-level seats: no line item, no quantity
ALTER TABLE public.line_item_assignments ALTER COLUMN line_item_id DROP NOT NULL;
ALTER TABLE public.line_item_assignments ALTER COLUMN quantity DROP NOT NULL;

-- Validation trigger: skip when this is a site-level seat (no line_item_id)
CREATE OR REPLACE FUNCTION public.validate_line_item_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  stage1_qty numeric;
  used numeric;
BEGIN
  IF NEW.line_item_id IS NULL THEN
    RETURN NEW; -- site-level seat, nothing to validate
  END IF;
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;
  IF NEW.site_assignment_id IS NOT NULL THEN
    SELECT quantity INTO stage1_qty
      FROM site_assignment_items
      WHERE site_assignment_id = NEW.site_assignment_id
        AND po_line_item_id = NEW.line_item_id;
    IF stage1_qty IS NULL THEN
      RAISE EXCEPTION 'Line item is not part of the selected site assignment';
    END IF;
    SELECT COALESCE(SUM(quantity), 0) INTO used
      FROM line_item_assignments
      WHERE site_assignment_id = NEW.site_assignment_id
        AND line_item_id = NEW.line_item_id
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    IF used + NEW.quantity > stage1_qty + 0.0001 THEN
      RAISE EXCEPTION 'Supervisor-assignment qty (% + %) exceeds site-assignment qty (%)', used, NEW.quantity, stage1_qty;
    END IF;
  END IF;
  RETURN NEW;
END$function$;

-- Add supervisor seat to a site assignment (idempotent per pair)
CREATE OR REPLACE FUNCTION public.add_supervisor_to_site(
  _site_assignment_id uuid,
  _supervisor_id uuid,
  _assigned_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing_id uuid;
  new_id uuid;
BEGIN
  SELECT id INTO existing_id
    FROM line_item_assignments
    WHERE site_assignment_id = _site_assignment_id
      AND supervisor_id = _supervisor_id
    LIMIT 1;
  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  INSERT INTO line_item_assignments (site_assignment_id, supervisor_id, assigned_date, line_item_id, quantity)
    VALUES (_site_assignment_id, _supervisor_id, _assigned_date, NULL, NULL)
    RETURNING id INTO new_id;
  RETURN new_id;
END$$;

GRANT EXECUTE ON FUNCTION public.add_supervisor_to_site(uuid, uuid, date) TO authenticated, service_role;
