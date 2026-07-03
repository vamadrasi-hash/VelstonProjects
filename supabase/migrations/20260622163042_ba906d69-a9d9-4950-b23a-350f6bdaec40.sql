ALTER TABLE public.site_assignments ADD COLUMN area_id uuid REFERENCES public.areas(id) ON DELETE CASCADE;
ALTER TABLE public.site_assignments ALTER COLUMN site_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_site_assignments_area_id ON public.site_assignments(area_id);

-- Backfill area_id from existing site_id where an area with the same name exists under the PO's work order (sites.id = site_assignments.site_id).
UPDATE public.site_assignments sa
SET area_id = a.id
FROM public.areas a, public.sites s
WHERE sa.area_id IS NULL
  AND sa.site_id = s.id
  AND a.site_id = s.id
  AND lower(a.name) = lower(s.name);