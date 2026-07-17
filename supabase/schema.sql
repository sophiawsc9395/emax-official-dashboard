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

-- ─── Rent-to-Own (ERP rewrite) ────────────────────────────────────────────────
-- Replaces the old single-blob "emax_v5_rto_customers" row in app_storage.
-- Same problem as orders had: every payment tick rewrote every customer's
-- entire record. Split into:
--   - `rto_customers`  one row per customer (header + denormalized paid_count/
--                      total_received so the list view never needs payments)
--   - `rto_payments`   one row per scheduled month, upserted individually —
--                      marking one payment writes ONE row, not the whole list.

create table if not exists public.rto_customers (
  id text primary key
);

alter table public.rto_customers add column if not exists member_id text;
alter table public.rto_customers add column if not exists name text;
alter table public.rto_customers add column if not exists branch text;
alter table public.rto_customers add column if not exists contact_number text;
alter table public.rto_customers add column if not exists sales_invoice_date text;
alter table public.rto_customers add column if not exists tenure int;
alter table public.rto_customers add column if not exists monthly_installment numeric;
alter table public.rto_customers add column if not exists finance_price numeric;
alter table public.rto_customers add column if not exists agreement_fee numeric;
alter table public.rto_customers add column if not exists stamping_fee numeric;
alter table public.rto_customers add column if not exists cost numeric;
alter table public.rto_customers add column if not exists auto_debit_month int;
alter table public.rto_customers add column if not exists auto_debit_year int;
-- Denormalized aggregates, kept in sync by the app on every payment write —
-- lets the customer list/cards and portfolio totals render without ever
-- joining or fetching the payments table.
alter table public.rto_customers add column if not exists paid_count int not null default 0;
alter table public.rto_customers add column if not exists total_received numeric not null default 0;
alter table public.rto_customers add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.rto_customers add column if not exists created_at timestamptz not null default now();
alter table public.rto_customers add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_rto_customers_branch on public.rto_customers (branch);

drop trigger if exists trg_rto_customers_touch_updated_at on public.rto_customers;
create trigger trg_rto_customers_touch_updated_at
  before update on public.rto_customers
  for each row execute function public.touch_updated_at();

create table if not exists public.rto_payments (
  id bigserial primary key
);

alter table public.rto_payments add column if not exists customer_id text;
alter table public.rto_payments add column if not exists sched_key text;
alter table public.rto_payments add column if not exists paid boolean not null default false;
alter table public.rto_payments add column if not exists amount numeric;
alter table public.rto_payments add column if not exists pay_date text;
alter table public.rto_payments add column if not exists inv_opened boolean not null default false;
alter table public.rto_payments add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rto_payments_customer_id_fkey'
  ) then
    alter table public.rto_payments
      add constraint rto_payments_customer_id_fkey
      foreign key (customer_id) references public.rto_customers(id) on delete cascade;
  end if;
end $$;

-- One row per (customer, scheduled month) — this is the upsert target that
-- lets "mark paid" touch exactly one row instead of the whole customer list.
create unique index if not exists idx_rto_payments_customer_sched on public.rto_payments (customer_id, sched_key);

drop trigger if exists trg_rto_payments_touch_updated_at on public.rto_payments;
create trigger trg_rto_payments_touch_updated_at
  before update on public.rto_payments
  for each row execute function public.touch_updated_at();

alter table public.rto_customers enable row level security;
alter table public.rto_payments enable row level security;

drop policy if exists "Allow authenticated full access" on public.rto_customers;
create policy "Allow authenticated full access"
  on public.rto_customers
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated full access" on public.rto_payments;
create policy "Allow authenticated full access"
  on public.rto_payments
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

-- ─── Realtime ────────────────────────────────────────────────────────────
-- Required for the Order Tracking page's live updates (no manual refresh
-- needed) — without this, changes made on one device won't show up on
-- another until the page is reloaded. Safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='order_history'
  ) then
    alter publication supabase_realtime add table public.order_history;
  end if;
end $$;
