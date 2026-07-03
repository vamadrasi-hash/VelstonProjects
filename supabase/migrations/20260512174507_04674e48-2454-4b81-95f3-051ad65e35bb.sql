
create table public.contractors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  created_at timestamptz not null default now()
);

create table public.supervisors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  designation text not null,
  contractor_id uuid references public.contractors(id) on delete cascade,
  is_busy boolean not null default false,
  current_line_item_id uuid,
  current_supervisor_id uuid references public.supervisors(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  site text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  description text not null,
  uom text not null,
  quantity numeric not null default 0,
  rate numeric not null default 0,
  created_at timestamptz not null default now()
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid references public.quotations(id) on delete set null,
  client_name text not null,
  site text not null,
  created_at timestamptz not null default now()
);

create table public.po_line_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  description text not null,
  uom text not null,
  quantity numeric not null default 0,
  supervisor_id uuid references public.supervisors(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  line_item_id uuid references public.po_line_items(id) on delete set null,
  supervisor_id uuid references public.supervisors(id) on delete set null,
  contractor_id uuid references public.contractors(id) on delete set null,
  worker_id uuid references public.workers(id) on delete set null,
  wage_scale numeric not null,
  hours numeric not null,
  total_wages numeric not null,
  released_at timestamptz not null default now()
);

alter table public.contractors enable row level security;
alter table public.supervisors enable row level security;
alter table public.workers enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.po_line_items enable row level security;
alter table public.daily_logs enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['contractors','supervisors','workers','quotations','quotation_items','purchase_orders','po_line_items','daily_logs']) loop
    execute format('create policy "demo_all_select" on public.%I for select using (true)', t);
    execute format('create policy "demo_all_insert" on public.%I for insert with check (true)', t);
    execute format('create policy "demo_all_update" on public.%I for update using (true) with check (true)', t);
    execute format('create policy "demo_all_delete" on public.%I for delete using (true)', t);
  end loop;
end$$;
