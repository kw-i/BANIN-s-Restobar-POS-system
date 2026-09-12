-- ============================================================
-- Banin's Restobar POS — feature update 2
-- Run in Supabase SQL Editor after schema.sql, fix_delete_constraints.sql,
-- and feature_update.sql
-- ============================================================

-- ---------- Staff profile + approval workflow ----------
alter table public.staff
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists approved boolean not null default true,
  add column if not exists last_seen_at timestamptz;

-- New signups need an admin's approval before they can log in.
-- (Existing rows keep the column default of `true` so nobody
-- currently in the system gets locked out by this migration.)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.staff (id, full_name, phone, email, approved)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'phone',
    new.email,
    false
  );
  return new;
end;
$$ language plpgsql security definer;

-- Staff can see their own row; admins can see everyone's.
drop policy if exists "staff can read all staff" on public.staff;
create policy "read own or admin reads all" on public.staff
  for select using (auth.uid() = id or public.is_admin());

-- Admins can update anyone's staff row (needed to approve accounts,
-- change roles, etc). Self-updates (e.g. the presence heartbeat)
-- still go through the existing "staff can update own profile" policy.
create policy "admin updates any staff" on public.staff
  for update using (public.is_admin()) with check (public.is_admin());

-- Only admins may change `role` or `approved` — this blocks a regular
-- employee from just flipping their own approval flag via the API.
-- (auth.uid() is null when this runs from the SQL Editor / service
-- role, e.g. your first "make me an admin" query, so that path is
-- never blocked by this trigger.)
create or replace function public.protect_staff_privileged_fields()
returns trigger as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role or new.approved is distinct from old.approved then
      raise exception 'Only admins can change role or approval status';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists protect_staff_privileged_fields_trigger on public.staff;
create trigger protect_staff_privileged_fields_trigger
  before update on public.staff
  for each row execute procedure public.protect_staff_privileged_fields();

-- Lets the Employees dashboard show name/phone/email/last login
-- without giving the browser direct access to auth.users.
create or replace function public.admin_list_staff()
returns table (
  id uuid, full_name text, phone text, email text, role text,
  approved boolean, last_seen_at timestamptz, created_at timestamptz,
  last_sign_in_at timestamptz
) as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  return query
    select s.id, s.full_name, s.phone, s.email, s.role, s.approved,
           s.last_seen_at, s.created_at, u.last_sign_in_at
    from public.staff s
    join auth.users u on u.id = s.id
    order by s.created_at desc;
end;
$$ language plpgsql security definer;

-- ---------- Tab notes (visible + editable by anyone signed in) ----------
alter table public.tabs add column if not exists notes text not null default '';
