
CREATE OR REPLACE FUNCTION public.release_supervisor_from_site(
  _area_id uuid,
  _supervisor_id uuid,
  _replacement_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- Reassign all line items at this area from old to new supervisor
    UPDATE line_item_assignments
      SET supervisor_id = _replacement_id
      WHERE supervisor_id = _supervisor_id
        AND (
          area_id = _area_id
          OR site_assignment_id IN (SELECT id FROM site_assignments WHERE area_id = _area_id)
        );

    -- Transfer workers
    UPDATE workers
      SET current_supervisor_id = _replacement_id
      WHERE current_area_id = _area_id
        AND current_supervisor_id = _supervisor_id
        AND is_busy = true;
  ELSE
    -- No replacement, no workers: simply remove this supervisor's line items at this area
    DELETE FROM line_item_assignments
      WHERE supervisor_id = _supervisor_id
        AND (
          area_id = _area_id
          OR site_assignment_id IN (SELECT id FROM site_assignments WHERE area_id = _area_id)
        );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_supervisor_from_site(uuid, uuid, uuid) TO authenticated;
