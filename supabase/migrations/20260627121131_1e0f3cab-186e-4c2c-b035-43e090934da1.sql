
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS quotation_no text;
CREATE UNIQUE INDEX IF NOT EXISTS quotations_quotation_no_key ON public.quotations(quotation_no) WHERE quotation_no IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_assignment_no()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  parent_no text;
  existing_no text;
  next_n int;
BEGIN
  IF NEW.site_assignment_id IS NOT NULL THEN
    -- Reuse the same assignment_no if this supervisor already has rows under this SA
    SELECT assignment_no INTO existing_no
      FROM line_item_assignments
      WHERE site_assignment_id = NEW.site_assignment_id
        AND supervisor_id = NEW.supervisor_id
      LIMIT 1;

    SELECT assignment_no INTO parent_no FROM site_assignments WHERE id = NEW.site_assignment_id;
    NEW.parent_assignment_no := parent_no;

    IF existing_no IS NOT NULL THEN
      NEW.assignment_no := existing_no;
    ELSIF NEW.assignment_no IS NULL THEN
      SELECT COALESCE(MAX(
               NULLIF(regexp_replace(assignment_no, '^.*-(\d+)$', '\1'), '')::int
             ), 0) + 1
        INTO next_n
        FROM line_item_assignments
        WHERE site_assignment_id = NEW.site_assignment_id;
      NEW.assignment_no := parent_no || '-' || next_n::text;
    END IF;
  ELSIF NEW.assignment_no IS NULL THEN
    NEW.assignment_no := 'VEL-' || lpad(nextval('assignment_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END$function$;
