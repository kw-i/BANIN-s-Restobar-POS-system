-- Run this in Supabase SQL Editor.
-- Fixes: "won't let me delete users" — foreign keys were blocking
-- the delete because tabs/tab_items referenced the staff row with
-- no ON DELETE action. This changes them to SET NULL, so deleting
-- a staff/auth user just clears who-created-it on old records
-- instead of blocking the delete entirely.

alter table public.tabs drop constraint if exists tabs_opened_by_fkey;
alter table public.tabs add constraint tabs_opened_by_fkey
  foreign key (opened_by) references public.staff(id) on delete set null;

alter table public.tabs drop constraint if exists tabs_closed_by_fkey;
alter table public.tabs add constraint tabs_closed_by_fkey
  foreign key (closed_by) references public.staff(id) on delete set null;

alter table public.tab_items drop constraint if exists tab_items_created_by_fkey;
alter table public.tab_items add constraint tab_items_created_by_fkey
  foreign key (created_by) references public.staff(id) on delete set null;
