ALTER TABLE public.line_item_assignments
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_no text UNIQUE;

CREATE SEQUENCE IF NOT EXISTS public.assignment_number_seq START 1;

CREATE OR REPLACE FUNCTION public.set_assignment_no()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.assignment_no IS NULL THEN
    NEW.assignment_no := 'VEL-' || lpad(nextval('assignment_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_set_assignment_no ON public.line_item_assignments;
CREATE TRIGGER trg_set_assignment_no
  BEFORE INSERT ON public.line_item_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_assignment_no();

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn
  FROM public.line_item_assignments WHERE assignment_no IS NULL
)
UPDATE public.line_item_assignments l
SET assignment_no = 'VEL-' || lpad(o.rn::text,4,'0')
FROM ordered o WHERE o.id = l.id;

SELECT setval('public.assignment_number_seq',
  GREATEST(COALESCE((SELECT max(substring(assignment_no from 5)::int)
            FROM public.line_item_assignments), 0), 1));
