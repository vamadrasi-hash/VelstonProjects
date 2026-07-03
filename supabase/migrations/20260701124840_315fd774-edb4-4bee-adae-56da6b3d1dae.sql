-- Soft-delete columns for line_item_assignments so released seats remain visible as history.
ALTER TABLE public.line_item_assignments
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_by uuid,
  ADD COLUMN IF NOT EXISTS replaced_by_supervisor_id uuid;

CREATE INDEX IF NOT EXISTS line_item_assignments_released_at_idx
  ON public.line_item_assignments(released_at);

-- Replace release RPC to soft-delete (set released_at) instead of hard DELETE.
CREATE OR REPLACE FUNCTION public.release_supervisor_from_site(
  _area_id uuid,
  _supervisor_id uuid,
  _replacement_id uuid DEFAULT NULL::uuid
)
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
    -- Reassign live workers
    UPDATE workers
      SET current_supervisor_id = _replacement_id
      WHERE current_area_id = _area_id
        AND current_supervisor_id = _supervisor_id
        AND is_busy = true;

    -- Mark outgoing seat(s) released (soft), record who took over
    UPDATE line_item_assignments
      SET released_at = now(),
          released_by = auth.uid(),
          replaced_by_supervisor_id = _replacement_id
      WHERE supervisor_id = _supervisor_id
        AND released_at IS NULL
        AND (
          area_id = _area_id
          OR site_assignment_id IN (SELECT id FROM site_assignments WHERE area_id = _area_id)
        );

    -- If replacement already has an active seat on this site, keep it; otherwise create a fresh seat by cloning
    -- (skip clone here; add_supervisor_to_site can be called by admin UI if needed)

    UPDATE site_assignments
      SET primary_supervisor_id = _replacement_id
      WHERE area_id = _area_id
        AND primary_supervisor_id = _supervisor_id;
  ELSE
    UPDATE line_item_assignments
      SET released_at = now(),
          released_by = auth.uid()
      WHERE supervisor_id = _supervisor_id
        AND released_at IS NULL
        AND (
          area_id = _area_id
          OR site_assignment_id IN (SELECT id FROM site_assignments WHERE area_id = _area_id)
        );

    UPDATE site_assignments
      SET primary_supervisor_id = NULL
      WHERE area_id = _area_id
        AND primary_supervisor_id = _supervisor_id;
  END IF;
END;
$function$;

-- Update add_supervisor_to_site so a previously-released supervisor can be added back as a fresh seat
CREATE OR REPLACE FUNCTION public.add_supervisor_to_site(
  _site_assignment_id uuid,
  _supervisor_id uuid,
  _assigned_date date DEFAULT CURRENT_DATE
)
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
      AND released_at IS NULL
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
END;
$function$;