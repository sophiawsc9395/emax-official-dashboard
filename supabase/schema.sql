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

-- ─── Orders (ERP rewrite) ─────────────────────────────────────────────────────
-- Replaces the old single-blob "emax_v5_orders" row in app_storage with a
-- proper per-row schema: one row per order (current state only), one row per
-- tracking event (append-only), and real Storage files instead of base64.
-- Matches what src/storage/ordersApi.js already reads/writes — this is the
-- missing piece to actually deploy it.

create table if not exists public.orders (
  id text primary key
);

-- Defensive column-by-column add: if `orders` already existed from an earlier
-- partial run, `create table if not exists` above is a no-op and any columns
-- missing from that earlier version would otherwise never get created. Adding
-- each one explicitly guarantees the full shape regardless of prior state.
alter table public.orders add column if not exists step int not null default 1;
alter table public.orders add column if not exists branch text;
alter table public.orders add column if not exists order_type text not null default 'ccm';
alter table public.orders add column if not exists stock_status text;
alter table public.orders add column if not exists cancelled boolean not null default false;
alter table public.orders add column if not exists cancelled_reason text;
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists phone_model text;
alter table public.orders add column if not exists agreement_number text;
alter table public.orders add column if not exists invoice_no text;
alter table public.orders add column if not exists merchant text;
alter table public.orders add column if not exists short_payment_pending boolean not null default false;
alter table public.orders add column if not exists pending_branch_action boolean not null default false;
alter table public.orders add column if not exists last_history_date text;
alter table public.orders add column if not exists last_history_time text;
alter table public.orders add column if not exists step_dates jsonb not null default '{}'::jsonb;
alter table public.orders add column if not exists last_verification jsonb;
alter table public.orders add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.orders add column if not exists created_at timestamptz not null default now();
alter table public.orders add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_orders_branch on public.orders (branch);
create index if not exists idx_orders_step on public.orders (step);
create index if not exists idx_orders_order_type on public.orders (order_type);
create index if not exists idx_orders_cancelled on public.orders (cancelled);

drop trigger if exists trg_orders_touch_updated_at on public.orders;
create trigger trg_orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

-- Append-only tracking timeline. Never rewritten, only inserted into —
-- one row per step/event, fetched lazily only when an order's Detail
-- page is opened (or in a batched IN() query for report generation).
create table if not exists public.order_history (
  id bigserial primary key
);

alter table public.order_history add column if not exists order_id text;
alter table public.order_history add column if not exists step int;
alter table public.order_history add column if not exists date text;
alter table public.order_history add column if not exists time text;
alter table public.order_history add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.order_history add column if not exists created_at timestamptz not null default now();

-- Add the FK separately (and only if missing) since add-column-if-not-exists
-- above can't carry a "references" clause safely on a possibly-existing column.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_history_order_id_fkey'
  ) then
    alter table public.order_history
      add constraint order_history_order_id_fkey
      foreign key (order_id) references public.orders(id) on delete cascade;
  end if;
end $$;

create index if not exists idx_order_history_order_id on public.order_history (order_id, id);

alter table public.orders enable row level security;
alter table public.order_history enable row level security;

drop policy if exists "Allow authenticated full access" on public.orders;
create policy "Allow authenticated full access"
  on public.orders
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated full access" on public.order_history;
create policy "Allow authenticated full access"
  on public.order_history
  for all
  to authenticated
  using (true)
  with check (true);

-- ─── Order files storage bucket ───────────────────────────────────────────────
-- Private bucket — every uploaded file (payment slips, IC copies, agreements,
-- collection photos) lives here as {name, path}, never as base64 in JSON.
-- Access is via short-lived signed URLs generated on demand (signOrderFiles),
-- never a public URL.
insert into storage.buckets (id, name, public)
values ('order-files', 'order-files', false)
on conflict (id) do nothing;

drop policy if exists "Allow authenticated access to order-files" on storage.objects;
create policy "Allow authenticated access to order-files"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'order-files')
  with check (bucket_id = 'order-files');

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
