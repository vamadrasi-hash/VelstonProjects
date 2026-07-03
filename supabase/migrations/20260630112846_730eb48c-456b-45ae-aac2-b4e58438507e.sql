
-- Add current_area_id to workers
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS current_area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL;

-- Site remarks (one per supervisor/site/date)
CREATE TABLE IF NOT EXISTS public.sup_site_remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id uuid NOT NULL REFERENCES public.supervisors(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  remark text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supervisor_id, area_id, work_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sup_site_remarks TO authenticated;
GRANT ALL ON public.sup_site_remarks TO service_role;

ALTER TABLE public.sup_site_remarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read sup_site_remarks" ON public.sup_site_remarks FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write sup_site_remarks" ON public.sup_site_remarks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RPC: guarded supervisor release with auto worker transfer
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
  sa_row record;
BEGIN
  SELECT COUNT(*) INTO active_workers
    FROM workers
    WHERE current_area_id = _area_id AND is_busy = true;

  IF active_workers > 0 AND _replacement_id IS NULL THEN
    RAISE EXCEPTION 'Site has % active worker(s); a replacement supervisor is required', active_workers;
  END IF;

  IF _replacement_id IS NOT NULL THEN
    -- Ensure replacement has a site_assignment row for this area
    SELECT * INTO sa_row FROM site_assignments
      WHERE area_id = _area_id AND supervisor_id = _replacement_id
      LIMIT 1;
    IF NOT FOUND THEN
      INSERT INTO site_assignments (area_id, supervisor_id)
        SELECT _area_id, _replacement_id;
    END IF;

    -- Transfer workers
    UPDATE workers
      SET current_supervisor_id = _replacement_id
      WHERE current_area_id = _area_id
        AND current_supervisor_id = _supervisor_id
        AND is_busy = true;
  END IF;

  -- Remove the supervisor's assignment to this site
  DELETE FROM site_assignments
    WHERE area_id = _area_id AND supervisor_id = _supervisor_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_supervisor_from_site(uuid, uuid, uuid) TO authenticated;
