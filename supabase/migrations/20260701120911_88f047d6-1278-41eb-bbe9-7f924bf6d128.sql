
-- 1) Column
ALTER TABLE public.site_assignments
  ADD COLUMN IF NOT EXISTS primary_supervisor_id uuid REFERENCES public.supervisors(id) ON DELETE SET NULL;

-- 2) Backfill: earliest LIA supervisor per SA
UPDATE public.site_assignments sa
SET primary_supervisor_id = sub.supervisor_id
FROM (
  SELECT DISTINCT ON (site_assignment_id)
    site_assignment_id, supervisor_id
  FROM public.line_item_assignments
  WHERE site_assignment_id IS NOT NULL
  ORDER BY site_assignment_id, assigned_date ASC, created_at ASC
) sub
WHERE sa.id = sub.site_assignment_id
  AND sa.primary_supervisor_id IS NULL;

-- 3) add_supervisor_to_site: first added becomes primary
CREATE OR REPLACE FUNCTION public.add_supervisor_to_site(_site_assignment_id uuid, _supervisor_id uuid, _assigned_date date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing_id uuid;
  new_id uuid;
  cur_primary uuid;
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

  SELECT primary_supervisor_id INTO cur_primary
    FROM site_assignments WHERE id = _site_assignment_id;
  IF cur_primary IS NULL THEN
    UPDATE site_assignments SET primary_supervisor_id = _supervisor_id
      WHERE id = _site_assignment_id;
  END IF;

  RETURN new_id;
END$function$;

-- 4) Promote helper
CREATE OR REPLACE FUNCTION public.set_primary_supervisor(_site_assignment_id uuid, _supervisor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ok int;
BEGIN
  SELECT COUNT(*) INTO ok FROM line_item_assignments
    WHERE site_assignment_id = _site_assignment_id AND supervisor_id = _supervisor_id;
  IF ok = 0 THEN
    RAISE EXCEPTION 'Supervisor is not assigned to this site';
  END IF;
  UPDATE site_assignments SET primary_supervisor_id = _supervisor_id
    WHERE id = _site_assignment_id;
END$function$;

-- 5) Release helper: transfer primary flag if the released one was primary
CREATE OR REPLACE FUNCTION public.release_supervisor_from_site(_area_id uuid, _supervisor_id uuid, _replacement_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  active_workers int;
BEGIN
  SELECT COUNT(*) INTO active_workers
    FROM workers
    WHERE current_area_id = _area_id
      AND current_supervisor_id = _supervisor_id
      AND is_busy = true;

  IF active_workers > 0 AND _replacement_id IS NULL THEN
    RAISE EXCEPTION 'Site has % active worker(s) under this supervisor; a replacement supervisor is required', active_workers;
  END IF;

  IF _replacement_id IS NOT NULL THEN
    -- Move all LIAs (site-level and line-level) from old to new
    UPDATE line_item_assignments
      SET supervisor_id = _replacement_id
      WHERE supervisor_id = _supervisor_id
        AND (
          area_id = _area_id
          OR site_assignment_id IN (SELECT id FROM site_assignments WHERE area_id = _area_id)
        );

    UPDATE workers
      SET current_supervisor_id = _replacement_id
      WHERE current_area_id = _area_id
        AND current_supervisor_id = _supervisor_id
        AND is_busy = true;

    -- Promote replacement to primary on any SA at this area where old was primary
    UPDATE site_assignments
      SET primary_supervisor_id = _replacement_id
      WHERE area_id = _area_id
        AND primary_supervisor_id = _supervisor_id;
  ELSE
    DELETE FROM line_item_assignments
      WHERE supervisor_id = _supervisor_id
        AND (
          area_id = _area_id
          OR site_assignment_id IN (SELECT id FROM site_assignments WHERE area_id = _area_id)
        );

    -- If old was primary, clear it (site becomes unassigned)
    UPDATE site_assignments
      SET primary_supervisor_id = NULL
      WHERE area_id = _area_id
        AND primary_supervisor_id = _supervisor_id;
  END IF;
END;
$function$;
