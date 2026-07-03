
-- 1. Employee types master
CREATE TABLE public.employee_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.employee_types TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_types TO authenticated;
GRANT ALL ON public.employee_types TO service_role;
ALTER TABLE public.employee_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read employee_types" ON public.employee_types FOR SELECT USING (true);
CREATE POLICY "staff manage employee_types" ON public.employee_types FOR ALL
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

INSERT INTO public.employee_types (name) VALUES ('Worker'),('Supervisor'),('Contractor')
  ON CONFLICT (name) DO NOTHING;

-- 2. Add shared employee fields to workers, supervisors, contractors
ALTER TABLE public.workers
  ADD COLUMN scrum_id text,
  ADD COLUMN mobile text,
  ADD COLUMN aadhar text,
  ADD COLUMN gender text,
  ADD COLUMN employee_type_id uuid REFERENCES public.employee_types(id);

ALTER TABLE public.supervisors
  ADD COLUMN scrum_id text,
  ADD COLUMN mobile text,
  ADD COLUMN aadhar text,
  ADD COLUMN gender text,
  ADD COLUMN employee_type_id uuid REFERENCES public.employee_types(id);

ALTER TABLE public.contractors
  ADD COLUMN scrum_id text,
  ADD COLUMN mobile text,
  ADD COLUMN aadhar text,
  ADD COLUMN gender text,
  ADD COLUMN employee_type_id uuid REFERENCES public.employee_types(id);

-- 3. Partial CHECKs (allow NULL for existing rows)
ALTER TABLE public.workers
  ADD CONSTRAINT workers_mobile_chk CHECK (mobile IS NULL OR mobile ~ '^[0-9]{10}$'),
  ADD CONSTRAINT workers_aadhar_chk CHECK (aadhar IS NULL OR aadhar ~ '^[0-9]{12}$');
ALTER TABLE public.supervisors
  ADD CONSTRAINT supervisors_mobile_chk CHECK (mobile IS NULL OR mobile ~ '^[0-9]{10}$'),
  ADD CONSTRAINT supervisors_aadhar_chk CHECK (aadhar IS NULL OR aadhar ~ '^[0-9]{12}$');
ALTER TABLE public.contractors
  ADD CONSTRAINT contractors_mobile_chk CHECK (mobile IS NULL OR mobile ~ '^[0-9]{10}$'),
  ADD CONSTRAINT contractors_aadhar_chk CHECK (aadhar IS NULL OR aadhar ~ '^[0-9]{12}$');

-- 4. Backfill employee_type_id for existing rows
UPDATE public.workers SET employee_type_id = (SELECT id FROM public.employee_types WHERE name='Worker') WHERE employee_type_id IS NULL;
UPDATE public.supervisors SET employee_type_id = (SELECT id FROM public.employee_types WHERE name='Supervisor') WHERE employee_type_id IS NULL;
UPDATE public.contractors SET employee_type_id = (SELECT id FROM public.employee_types WHERE name='Contractor') WHERE employee_type_id IS NULL;

-- 5. Audit log for daily_logs edits
CREATE TABLE public.daily_log_edits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  daily_log_id uuid,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  edited_by uuid,
  edited_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.daily_log_edits TO authenticated;
GRANT ALL ON public.daily_log_edits TO service_role;
ALTER TABLE public.daily_log_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read edits" ON public.daily_log_edits FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "sup read own edits" ON public.daily_log_edits FOR SELECT
  USING (public.has_role(auth.uid(),'supervisor') AND edited_by = auth.uid());

CREATE OR REPLACE FUNCTION public.log_daily_log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.daily_log_edits(daily_log_id, action, before_data, after_data, edited_by)
    VALUES (OLD.id, 'update', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.daily_log_edits(daily_log_id, action, before_data, after_data, edited_by)
    VALUES (OLD.id, 'delete', to_jsonb(OLD), NULL, auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_daily_logs_audit
AFTER UPDATE OR DELETE ON public.daily_logs
FOR EACH ROW EXECUTE FUNCTION public.log_daily_log_change();
