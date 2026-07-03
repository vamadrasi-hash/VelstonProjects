
-- ============ ENUMS ============
do $$ begin
  create type public.app_role as enum ('super_admin','admin','supervisor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.profile_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

-- ============ PROFILES ============
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  mobile text not null default '',
  email text not null default '',
  status public.profile_status not null default 'pending',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ============ USER ROLES ============
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

-- ============ SUPERVISOR LINK ============
alter table public.supervisors add column if not exists user_id uuid unique references auth.users(id) on delete set null;

-- ============ FUNCTIONS ============
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_approved(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where user_id = _user_id and status = 'approved')
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id,'super_admin') or public.has_role(_user_id,'admin')
$$;

-- Trigger: create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, full_name, mobile, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(new.raw_user_meta_data->>'mobile',''),
    coalesce(new.email,'')
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ DROP OLD DEMO POLICIES ============
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname='public' and policyname like 'demo_all_%'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ============ PROFILES POLICIES ============
create policy "own profile read" on public.profiles for select using (auth.uid() = user_id);
create policy "staff read profiles" on public.profiles for select using (public.is_staff(auth.uid()));
create policy "own profile update" on public.profiles for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status = (select status from public.profiles where user_id = auth.uid()));
create policy "staff update profiles" on public.profiles for update using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "self insert profile" on public.profiles for insert with check (auth.uid() = user_id);

-- ============ USER_ROLES POLICIES ============
create policy "own roles read" on public.user_roles for select using (auth.uid() = user_id);
create policy "staff read roles" on public.user_roles for select using (public.is_staff(auth.uid()));

create policy "manage non-super roles" on public.user_roles for insert
  with check (public.is_staff(auth.uid()) and role <> 'super_admin');
create policy "delete non-super roles" on public.user_roles for delete
  using (public.is_staff(auth.uid()) and role <> 'super_admin');

create policy "super manages super role" on public.user_roles for insert
  with check (public.has_role(auth.uid(),'super_admin'));
create policy "super deletes super role" on public.user_roles for delete
  using (public.has_role(auth.uid(),'super_admin'));

-- ============ BUSINESS TABLE POLICIES ============
-- Helper macro: staff = full CRUD, supervisor = SELECT
do $$
declare t text;
begin
  foreach t in array array[
    'quotations','quotation_items','purchase_orders','po_line_items',
    'clients','sites','areas','item_catalog','uoms','designations',
    'contractors','workers','supervisors'
  ]
  loop
    execute format('create policy "staff all" on public.%I for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()))', t);
    execute format('create policy "sup read" on public.%I for select using (public.has_role(auth.uid(),%L))', t, 'supervisor');
  end loop;
end $$;

-- daily_logs & line_item_assignments: supervisor restricted to own
create policy "staff all" on public.daily_logs for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "sup read logs" on public.daily_logs for select using (public.has_role(auth.uid(),'supervisor'));
create policy "sup insert own logs" on public.daily_logs for insert with check (
  public.has_role(auth.uid(),'supervisor') and supervisor_id in (select id from public.supervisors where user_id = auth.uid())
);
create policy "sup update own logs" on public.daily_logs for update using (
  public.has_role(auth.uid(),'supervisor') and supervisor_id in (select id from public.supervisors where user_id = auth.uid())
);
create policy "sup delete own logs" on public.daily_logs for delete using (
  public.has_role(auth.uid(),'supervisor') and supervisor_id in (select id from public.supervisors where user_id = auth.uid())
);

create policy "staff all" on public.line_item_assignments for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "sup read assigns" on public.line_item_assignments for select using (public.has_role(auth.uid(),'supervisor'));
create policy "sup insert own assigns" on public.line_item_assignments for insert with check (
  public.has_role(auth.uid(),'supervisor') and supervisor_id in (select id from public.supervisors where user_id = auth.uid())
);
create policy "sup update own assigns" on public.line_item_assignments for update using (
  public.has_role(auth.uid(),'supervisor') and supervisor_id in (select id from public.supervisors where user_id = auth.uid())
);

-- ============ SEED SUPER ADMIN ============
do $$
declare uid uuid;
begin
  select id into uid from auth.users where email = 'vamadrasi@gmail.com';
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      'vamadrasi@gmail.com', crypt('vinay@999', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Super Admin","mobile":""}'::jsonb,
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email','vamadrasi@gmail.com'), 'email', now(), now(), now());
  end if;

  insert into public.profiles (user_id, full_name, mobile, email, status, approved_at)
  values (uid, 'Super Admin', '', 'vamadrasi@gmail.com', 'approved', now())
  on conflict (user_id) do update set status = 'approved', full_name = excluded.full_name;

  insert into public.user_roles (user_id, role) values (uid, 'super_admin')
  on conflict (user_id, role) do nothing;
end $$;
