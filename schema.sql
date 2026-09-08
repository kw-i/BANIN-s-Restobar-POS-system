-- ============================================================
-- Banin's Restobar POS — Supabase schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Staff profile (extends Supabase auth.users)
create table if not exists public.staff (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'staff', -- 'staff' | 'admin'
  created_at timestamptz not null default now()
);

-- Menu items (so servers pick from a list instead of typing prices)
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  category text not null default 'General',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Tabs (replace fixed tables — one tab per group/customer)
create table if not exists public.tabs (
  id uuid primary key default gen_random_uuid(),
  label text not null,               -- e.g. "Tab 1", "Kuya Jun", "Table by window"
  status text not null default 'open', -- 'open' | 'closed'
  total numeric(10,2) not null default 0,
  opened_by uuid references public.staff(id),
  closed_by uuid references public.staff(id),
  device_id text,                    -- reference only, not used for sync logic
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

-- Items added to a tab (snapshot of name/price at time of order,
-- so later menu price changes don't rewrite history/reports)
create table if not exists public.tab_items (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.tabs(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id),
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  qty int not null default 1 check (qty > 0),
  notes text,
  device_id text,
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_tab_items_tab_id on public.tab_items(tab_id);
create index if not exists idx_tabs_status on public.tabs(status);
create index if not exists idx_tabs_closed_at on public.tabs(closed_at);

-- ============================================================
-- Row Level Security
-- Simple model: any signed-in staff member can read/write
-- everything. Good enough for a single small restobar with a
-- handful of trusted devices/accounts.
-- ============================================================

alter table public.staff enable row level security;
alter table public.menu_items enable row level security;
alter table public.tabs enable row level security;
alter table public.tab_items enable row level security;

create policy "staff can read all staff" on public.staff
  for select using (auth.role() = 'authenticated');

create policy "staff can update own profile" on public.staff
  for update using (auth.uid() = id);

create policy "staff can read menu" on public.menu_items
  for select using (auth.role() = 'authenticated');

create policy "staff can manage menu" on public.menu_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff can read tabs" on public.tabs
  for select using (auth.role() = 'authenticated');

create policy "staff can manage tabs" on public.tabs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff can read tab items" on public.tab_items
  for select using (auth.role() = 'authenticated');

create policy "staff can manage tab items" on public.tab_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Auto-create a staff row whenever someone signs up via Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.staff (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Sample menu (edit freely, or manage from the app's Menu tab)
-- ============================================================
insert into public.menu_items (name, price, category) values
  ('San Miguel Pale Pilsen', 75, 'Beer'),
  ('Red Horse Beer', 85, 'Beer'),
  ('Sisig', 220, 'Food'),
  ('Crispy Pata', 450, 'Food'),
  ('Sizzling Bulalo', 320, 'Food'),
  ('Fries', 120, 'Food'),
  ('Coke / Sprite', 60, 'Drinks'),
  ('Bottled Water', 40, 'Drinks')
on conflict do nothing;
