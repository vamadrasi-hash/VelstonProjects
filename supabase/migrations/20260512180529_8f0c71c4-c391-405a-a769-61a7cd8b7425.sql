
-- Clients
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX clients_name_lower_idx ON public.clients (lower(name));
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_all_select ON public.clients FOR SELECT USING (true);
CREATE POLICY demo_all_insert ON public.clients FOR INSERT WITH CHECK (true);
CREATE POLICY demo_all_update ON public.clients FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY demo_all_delete ON public.clients FOR DELETE USING (true);

-- Sites
CREATE TABLE public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sites_client_idx ON public.sites(client_id);
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_all_select ON public.sites FOR SELECT USING (true);
CREATE POLICY demo_all_insert ON public.sites FOR INSERT WITH CHECK (true);
CREATE POLICY demo_all_update ON public.sites FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY demo_all_delete ON public.sites FOR DELETE USING (true);

-- Item catalog
CREATE TABLE public.item_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  default_uom text,
  default_rate numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX item_catalog_desc_lower_idx ON public.item_catalog (lower(description));
ALTER TABLE public.item_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_all_select ON public.item_catalog FOR SELECT USING (true);
CREATE POLICY demo_all_insert ON public.item_catalog FOR INSERT WITH CHECK (true);
CREATE POLICY demo_all_update ON public.item_catalog FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY demo_all_delete ON public.item_catalog FOR DELETE USING (true);

-- UoMs
CREATE TABLE public.uoms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.uoms ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_all_select ON public.uoms FOR SELECT USING (true);
CREATE POLICY demo_all_insert ON public.uoms FOR INSERT WITH CHECK (true);
CREATE POLICY demo_all_update ON public.uoms FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY demo_all_delete ON public.uoms FOR DELETE USING (true);
INSERT INTO public.uoms (code, label) VALUES
  ('sqft','Square Feet'),('sqm','Square Meter'),('nos','Numbers'),
  ('mtr','Meter'),('rmt','Running Meter'),('kg','Kilogram'),
  ('ltr','Litre'),('lumpsum','Lumpsum');

-- Designations
CREATE TABLE public.designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.designations ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_all_select ON public.designations FOR SELECT USING (true);
CREATE POLICY demo_all_insert ON public.designations FOR INSERT WITH CHECK (true);
CREATE POLICY demo_all_update ON public.designations FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY demo_all_delete ON public.designations FOR DELETE USING (true);
INSERT INTO public.designations (name) VALUES
  ('Mason'),('Helper'),('Carpenter'),('Electrician'),
  ('Plumber'),('Painter'),('Supervisor');

-- Link columns on quotations & POs (nullable, non-breaking)
ALTER TABLE public.quotations ADD COLUMN client_id uuid REFERENCES public.clients(id);
ALTER TABLE public.quotations ADD COLUMN site_id uuid REFERENCES public.sites(id);
ALTER TABLE public.purchase_orders ADD COLUMN client_id uuid REFERENCES public.clients(id);
ALTER TABLE public.purchase_orders ADD COLUMN site_id uuid REFERENCES public.sites(id);
