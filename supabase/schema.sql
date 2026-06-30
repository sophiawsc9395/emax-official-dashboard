-- EMAX Dashboard — Supabase schema
-- Single key-value table mirrors the existing window.storage API exactly,
-- so no component code needs to change beyond the storage adapter itself.

create table if not exists public.app_storage (
  key text primary key,
  value text not null,
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

-- Row Level Security: this app has no login system, every viewer link is
-- effectively "public" (boss/branch views are read-only by design in the UI,
-- but the dashboard itself needs full read/write for whoever has that link).
-- We allow the anon key full access to this one table only.
alter table public.app_storage enable row level security;

drop policy if exists "Allow anon full access" on public.app_storage;
create policy "Allow anon full access"
  on public.app_storage
  for all
  to anon
  using (true)
  with check (true);
