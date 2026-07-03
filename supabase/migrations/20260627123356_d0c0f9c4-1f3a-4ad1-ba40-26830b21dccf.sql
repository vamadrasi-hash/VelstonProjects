
-- 1) Daily roster (today's pool of workers per supervisor)
CREATE TABLE public.sup_daily_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id uuid NOT NULL REFERENCES public.supervisors(id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supervisor_id, work_date, worker_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sup_daily_roster TO authenticated;
GRANT ALL ON public.sup_daily_roster TO service_role;

ALTER TABLE public.sup_daily_roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roster owner all"
  ON public.sup_daily_roster FOR ALL
  USING (
    supervisor_id IN (SELECT id FROM public.supervisors WHERE user_id = auth.uid())
    OR public.is_staff(auth.uid())
  )
  WITH CHECK (
    supervisor_id IN (SELECT id FROM public.supervisors WHERE user_id = auth.uid())
    OR public.is_staff(auth.uid())
  );

-- 2) Work photos (before/after, geo-tagged)
CREATE TABLE public.work_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id uuid NOT NULL REFERENCES public.supervisors(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  line_item_id uuid REFERENCES public.po_line_items(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('before','after')),
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  storage_path text NOT NULL,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX work_photos_lookup_idx ON public.work_photos (line_item_id, work_date, kind);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_photos TO authenticated;
GRANT ALL ON public.work_photos TO service_role;

ALTER TABLE public.work_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_photos owner all"
  ON public.work_photos FOR ALL
  USING (
    supervisor_id IN (SELECT id FROM public.supervisors WHERE user_id = auth.uid())
    OR public.is_staff(auth.uid())
  )
  WITH CHECK (
    supervisor_id IN (SELECT id FROM public.supervisors WHERE user_id = auth.uid())
    OR public.is_staff(auth.uid())
  );

-- 3) Storage RLS policies for work-photos bucket
-- Path convention: {auth.uid()}/{site_id}/{line_item_id}/{before|after}/{ts}.jpg
CREATE POLICY "work-photos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'work-photos');

CREATE POLICY "work-photos auth insert own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'work-photos'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_staff(auth.uid()))
  );

CREATE POLICY "work-photos auth update own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'work-photos'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_staff(auth.uid()))
  );

CREATE POLICY "work-photos auth delete own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'work-photos'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_staff(auth.uid()))
  );
