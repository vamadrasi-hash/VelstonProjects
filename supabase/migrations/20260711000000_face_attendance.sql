-- Face-recognition attendance
-- Supervisors scan workers' faces on arrival ("in") and departure ("out").
-- Each worker is enrolled once (128-d face descriptor), then matched on-device.

-- Helper: true when the current user is staff (admin/super_admin) or any supervisor.
CREATE OR REPLACE FUNCTION public.is_staff_or_supervisor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_staff(_user_id)
      OR EXISTS (SELECT 1 FROM public.supervisors WHERE user_id = _user_id);
$$;

-- 1) Face enrollments — one or more 128-float descriptors per worker.
CREATE TABLE public.worker_face_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  descriptor jsonb NOT NULL,                 -- JSON array of 128 float32 values
  source text NOT NULL DEFAULT 'capture' CHECK (source IN ('capture','profile_photo')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX worker_face_enrollments_worker_idx ON public.worker_face_enrollments(worker_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_face_enrollments TO authenticated;
GRANT ALL ON public.worker_face_enrollments TO service_role;

ALTER TABLE public.worker_face_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "face_enroll read"
  ON public.worker_face_enrollments FOR SELECT
  USING (public.is_staff_or_supervisor(auth.uid()));

CREATE POLICY "face_enroll insert"
  ON public.worker_face_enrollments FOR INSERT
  WITH CHECK (public.is_staff_or_supervisor(auth.uid()));

CREATE POLICY "face_enroll delete"
  ON public.worker_face_enrollments FOR DELETE
  USING (public.is_staff_or_supervisor(auth.uid()));

-- 2) Attendance events — an "in" or "out" scan for a worker on a given day.
CREATE TABLE public.attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  supervisor_id uuid REFERENCES public.supervisors(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('in','out')),
  method text NOT NULL DEFAULT 'face' CHECK (method IN ('face','manual')),
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  match_distance double precision,           -- face-match distance (lower = closer); null for manual
  storage_path text,                         -- optional snapshot in the attendance-photos bucket
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX attendance_events_worker_date_idx ON public.attendance_events(worker_id, work_date);
CREATE INDEX attendance_events_sup_date_idx ON public.attendance_events(supervisor_id, work_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_events TO authenticated;
GRANT ALL ON public.attendance_events TO service_role;

ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;

-- Anyone on staff (or any supervisor) may read attendance, so a supervisor can
-- see whether a worker has already checked in today even under another supervisor.
CREATE POLICY "attendance read"
  ON public.attendance_events FOR SELECT
  USING (public.is_staff_or_supervisor(auth.uid()));

CREATE POLICY "attendance insert"
  ON public.attendance_events FOR INSERT
  WITH CHECK (
    public.is_staff(auth.uid())
    OR supervisor_id IN (SELECT id FROM public.supervisors WHERE user_id = auth.uid())
  );

CREATE POLICY "attendance delete"
  ON public.attendance_events FOR DELETE
  USING (
    public.is_staff(auth.uid())
    OR supervisor_id IN (SELECT id FROM public.supervisors WHERE user_id = auth.uid())
  );

-- 3) Storage bucket for attendance snapshots (private; served via signed URLs).
INSERT INTO storage.buckets (id, name, public)
VALUES ('attendance-photos', 'attendance-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: {auth.uid()}/{worker_id}/{ts}.jpg
CREATE POLICY "attendance-photos auth read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'attendance-photos' AND public.is_staff_or_supervisor(auth.uid()));

CREATE POLICY "attendance-photos auth insert own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'attendance-photos'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_staff(auth.uid()))
  );

CREATE POLICY "attendance-photos auth delete own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'attendance-photos'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_staff(auth.uid()))
  );
