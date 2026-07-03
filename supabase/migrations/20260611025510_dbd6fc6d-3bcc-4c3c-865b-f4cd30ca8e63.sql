ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.supervisors ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS photo_url text;