-- ============================================================
-- Banin's Restobar POS — feature update
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Safe to run on top of schema.sql + fix_delete_constraints.sql
-- ============================================================

-- ---------- Inventory: stock count per menu item ----------
alter table public.menu_items
  add column if not exists stock_qty integer not null default 0,
  add column if not exists low_stock_threshold integer not null default 5;

-- ---------- Accounting: simple expense ledger ----------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(10,2) not null check (amount >= 0),
  category text not null default 'General',
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now()
);
alter table public.expenses enable row level security;

-- ---------- Helper: is the current user an admin? ----------
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.staff where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- To make your own account an admin, run (after signing up once):
--   update public.staff set role = 'admin' where id =
--     (select id from auth.users where email = 'you@example.com');

-- ============================================================
-- Tightened RLS — employees only ever see OPEN tabs (the live
-- tabbing system). Only admins can see closed tabs (needed for
-- Reports/Accounting), manage the menu/inventory, or touch
-- expenses.
-- ============================================================

drop policy if exists "staff can read tabs" on public.tabs;
create policy "read open tabs, or all if admin" on public.tabs
  for select using (status = 'open' or public.is_admin());

drop policy if exists "staff can manage tabs" on public.tabs;
create policy "manage open tabs, or all if admin" on public.tabs
  for insert with check (auth.role() = 'authenticated');
create policy "update tabs" on public.tabs
  for update using (status = 'open' or public.is_admin())
  with check (auth.role() = 'authenticated');
create policy "delete tabs" on public.tabs
  for delete using (status = 'open' or public.is_admin());

drop policy if exists "staff can read tab items" on public.tab_items;
create policy "read items of visible tabs" on public.tab_items
  for select using (
    exists (
      select 1 from public.tabs t
      where t.id = tab_items.tab_id and (t.status = 'open' or public.is_admin())
    )
  );

drop policy if exists "staff can manage tab items" on public.tab_items;
create policy "manage tab items" on public.tab_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Menu: everyone can read (needed to take orders), only admins can edit/stock
drop policy if exists "staff can manage menu" on public.menu_items;
create policy "admin manages menu" on public.menu_items
  for insert with check (public.is_admin());
create policy "admin updates menu" on public.menu_items
  for update using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes menu" on public.menu_items
  for delete using (public.is_admin());

-- Expenses: admin only, end to end
create policy "admin reads expenses" on public.expenses
  for select using (public.is_admin());
create policy "admin manages expenses" on public.expenses
  for insert with check (public.is_admin());
create policy "admin updates expenses" on public.expenses
  for update using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes expenses" on public.expenses
  for delete using (public.is_admin());

-- ============================================================
-- 12-hour auto-cleanup for open tabs
-- ============================================================

create or replace function public.delete_stale_open_tabs()
returns void as $$
begin
  delete from public.tabs
  where status = 'open' and created_at < now() - interval '12 hours';
end;
$$ language plpgsql security definer;

-- The app also calls this cleanup client-side on every load/refresh,
-- so stale tabs disappear even without a scheduled job. If you want
-- it to happen automatically in the background with nobody using the
-- app, and your Supabase project has the pg_cron extension available
-- (Database → Extensions → pg_cron), you can additionally run:
--
--   select cron.schedule('delete-stale-tabs', '0 * * * *',
--     'select public.delete_stale_open_tabs();');
--
-- That runs the cleanup once an hour. Not required — just a bonus
-- safety net for restaurants that don't have a screen open 24/7.
