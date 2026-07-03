ALTER TABLE public.sup_daily_roster
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS release_reason text;

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS zero_reason text;