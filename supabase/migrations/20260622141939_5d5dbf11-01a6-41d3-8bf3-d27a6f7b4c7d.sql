
-- ============================================================
-- 1. site_assignments (stage 1)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.site_assignment_number_seq START 1;

CREATE TABLE public.site_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  assignment_no text UNIQUE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (po_id, site_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_assignments TO authenticated;
GRANT ALL ON public.site_assignments TO service_role;
GRANT USAGE ON SEQUENCE public.site_assignment_number_seq TO authenticated, service_role;

ALTER TABLE public.site_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff all" ON public.site_assignments
  FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "sup read" ON public.site_assignments
  FOR SELECT USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE OR REPLACE FUNCTION public.set_site_assignment_no()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.assignment_no IS NULL THEN
    NEW.assignment_no := 'VEL-' || lpad(nextval('site_assignment_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_set_site_assignment_no
  BEFORE INSERT ON public.site_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_site_assignment_no();

-- ============================================================
-- 2. site_assignment_items (stage 1 line items)
-- ============================================================
CREATE TABLE public.site_assignment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_assignment_id uuid NOT NULL REFERENCES public.site_assignments(id) ON DELETE CASCADE,
  po_line_item_id uuid NOT NULL REFERENCES public.po_line_items(id) ON DELETE CASCADE,
  quantity numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_assignment_id, po_line_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_assignment_items TO authenticated;
GRANT ALL ON public.site_assignment_items TO service_role;

ALTER TABLE public.site_assignment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff all" ON public.site_assignment_items
  FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "sup read" ON public.site_assignment_items
  FOR SELECT USING (has_role(auth.uid(), 'supervisor'::app_role));

-- stage-1 qty cap: sum across all site assignments must not exceed PO line qty
CREATE OR REPLACE FUNCTION public.validate_site_assignment_item()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  po_qty numeric;
  used numeric;
BEGIN
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;
  SELECT quantity INTO po_qty FROM po_line_items WHERE id = NEW.po_line_item_id;
  SELECT COALESCE(SUM(quantity), 0) INTO used
    FROM site_assignment_items
    WHERE po_line_item_id = NEW.po_line_item_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  IF used + NEW.quantity > po_qty + 0.0001 THEN
    RAISE EXCEPTION 'Site-assignment qty (% + %) exceeds PO line qty (%)', used, NEW.quantity, po_qty;
  END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_validate_site_assignment_item
  BEFORE INSERT OR UPDATE ON public.site_assignment_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_site_assignment_item();

-- ============================================================
-- 3. extend line_item_assignments (stage 2)
-- ============================================================
ALTER TABLE public.line_item_assignments
  ADD COLUMN site_assignment_id uuid REFERENCES public.site_assignments(id) ON DELETE SET NULL,
  ADD COLUMN parent_assignment_no text,
  ADD COLUMN legacy_assignment_no text;

-- ============================================================
-- 4. Back-fill site_assignments + items from existing data
-- ============================================================
DO $$
DECLARE
  rec record;
  new_sa_id uuid;
  new_no text;
BEGIN
  FOR rec IN
    SELECT DISTINCT po.id AS po_id, po.site_id
    FROM line_item_assignments la
    JOIN po_line_items pli ON pli.id = la.line_item_id
    JOIN purchase_orders po ON po.id = pli.po_id
    WHERE po.site_id IS NOT NULL
  LOOP
    INSERT INTO site_assignments (po_id, site_id)
    VALUES (rec.po_id, rec.site_id)
    RETURNING id, assignment_no INTO new_sa_id, new_no;

    -- one site_assignment_item per distinct line item (full PO line qty)
    INSERT INTO site_assignment_items (site_assignment_id, po_line_item_id, quantity)
    SELECT new_sa_id, pli.id, pli.quantity
    FROM po_line_items pli
    WHERE pli.po_id = rec.po_id
      AND EXISTS (SELECT 1 FROM line_item_assignments la WHERE la.line_item_id = pli.id);

    -- link existing stage-2 rows + stash legacy number
    UPDATE line_item_assignments la
    SET site_assignment_id = new_sa_id,
        parent_assignment_no = new_no,
        legacy_assignment_no = la.assignment_no
    FROM po_line_items pli
    WHERE la.line_item_id = pli.id
      AND pli.po_id = rec.po_id;
  END LOOP;

  -- renumber stage-2 rows as VEL-####-N (numeric suffix, ordered by created_at)
  WITH ranked AS (
    SELECT la.id,
           la.parent_assignment_no,
           ROW_NUMBER() OVER (PARTITION BY la.site_assignment_id ORDER BY la.created_at, la.id) AS rn
    FROM line_item_assignments la
    WHERE la.site_assignment_id IS NOT NULL
  )
  UPDATE line_item_assignments la
  SET assignment_no = ranked.parent_assignment_no || '-' || ranked.rn::text
  FROM ranked
  WHERE la.id = ranked.id;
END$$;

-- ============================================================
-- 5. Replace set_assignment_no with stage-2 suffix logic
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_assignment_no()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  parent_no text;
  next_n int;
BEGIN
  IF NEW.site_assignment_id IS NOT NULL THEN
    SELECT assignment_no INTO parent_no FROM site_assignments WHERE id = NEW.site_assignment_id;
    NEW.parent_assignment_no := parent_no;
    IF NEW.assignment_no IS NULL THEN
      SELECT COALESCE(MAX(
               NULLIF(regexp_replace(assignment_no, '^.*-(\d+)$', '\1'), '')::int
             ), 0) + 1
        INTO next_n
        FROM line_item_assignments
        WHERE site_assignment_id = NEW.site_assignment_id;
      NEW.assignment_no := parent_no || '-' || next_n::text;
    END IF;
  ELSIF NEW.assignment_no IS NULL THEN
    -- legacy fallback
    NEW.assignment_no := 'VEL-' || lpad(nextval('assignment_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END$$;

-- trigger already exists; just ensure
DROP TRIGGER IF EXISTS trg_set_assignment_no ON public.line_item_assignments;
CREATE TRIGGER trg_set_assignment_no
  BEFORE INSERT ON public.line_item_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_assignment_no();

-- ============================================================
-- 6. Stage-2 qty cap: <= stage-1 qty for that (site_assignment, line item)
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_line_item_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  stage1_qty numeric;
  used numeric;
BEGIN
  IF NEW.quantity <= 0 THEN
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
END$$;

DROP TRIGGER IF EXISTS trg_validate_line_item_assignment ON public.line_item_assignments;
CREATE TRIGGER trg_validate_line_item_assignment
  BEFORE INSERT OR UPDATE ON public.line_item_assignments
  FOR EACH ROW EXECUTE FUNCTION public.validate_line_item_assignment();

-- Advance the sequence past back-filled numbers so new inserts don't collide
SELECT setval('site_assignment_number_seq',
  GREATEST(
    (SELECT COALESCE(MAX(NULLIF(regexp_replace(assignment_no, '^VEL-0*', ''), '')::int), 0)
       FROM site_assignments),
    1
  )
);
