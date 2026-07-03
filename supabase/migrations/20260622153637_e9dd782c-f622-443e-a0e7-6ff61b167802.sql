ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_site_id_fkey;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL;

ALTER TABLE public.areas DROP CONSTRAINT IF EXISTS areas_site_id_fkey;
ALTER TABLE public.areas ADD CONSTRAINT areas_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL;