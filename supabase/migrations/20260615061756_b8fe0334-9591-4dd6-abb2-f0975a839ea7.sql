CREATE TABLE public.sub_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (area_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sub_areas TO authenticated;
GRANT ALL ON public.sub_areas TO service_role;

ALTER TABLE public.sub_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage sub_areas" ON public.sub_areas
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "approved read sub_areas" ON public.sub_areas
  FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));

ALTER TABLE public.line_item_assignments
  ADD COLUMN sub_area_id uuid REFERENCES public.sub_areas(id) ON DELETE SET NULL;