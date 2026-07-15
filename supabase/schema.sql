-- EMAX Dashboard — Supabase schema (with authentication)
-- Run this in Supabase → SQL Editor to set up or update your schema.

-- ─── Storage table ──────────────────────────────────────────────────────────
create table if not exists public.app_storage (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- Auto-update updated_at on every write
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_updated_at on public.app_storage;
create trigger trg_touch_updated_at
  before update on public.app_storage
  for each row execute function public.touch_updated_at();

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Now that we have login, only authenticated users (i.e. anyone who has
-- signed in with a valid email/password) can read or write data.
-- The page-level email allowlists in the React code control which specific
-- user sees which page — but all valid users share the same data store.
alter table public.app_storage enable row level security;

-- Drop any old policies first
drop policy if exists "Allow anon full access" on public.app_storage;
drop policy if exists "Allow authenticated full access" on public.app_storage;

create policy "Allow authenticated full access"
  on public.app_storage
  for all
  to authenticated
  using (true)
  with check (true);

-- ─── Supabase Auth ───────────────────────────────────────────────────────────
-- No SQL needed here — Supabase Auth is built-in.
-- Create user accounts via Supabase Dashboard → Authentication → Users → Add user.
--
-- Suggested accounts to create (use your real email addresses):
--   admin@emax.com       → can open: Dashboard (main admin view)
--   boss@emax.com        → can open: Boss viewer (all branches, read-only)
--   km@emax.com          → can open: KM branch viewer
--   t1@emax.com          → can open: T1 branch viewer
--   tw2@emax.com         → can open: TW2 branch viewer
--   tw1@emax.com         → can open: TW1 branch viewer
--   ld@emax.com          → can open: LD branch viewer
--   kb@emax.com          → can open: KB branch viewer
--   t5@emax.com          → can open: T5 branch viewer
--   itcc@emax.com        → can open: ITCC branch viewer
--   tenom@emax.com       → can open: TENOM branch viewer
--   hq@emax.com          → can open: HQ branch viewer
--
-- The admin@emax.com account is also listed as ALLOWED in every branch
-- main.jsx, so admin can open any page. Adjust these in the src/*.main.jsx
-- files to match your actual email addresses.
