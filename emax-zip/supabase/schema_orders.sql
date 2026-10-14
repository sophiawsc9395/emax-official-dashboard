-- ═══════════════════════════════════════════════════════════════════════
-- EMAX Order Tracking — ERP-style relational schema (v2)
-- Replaces the single "emax_v5_orders" JSON blob in app_storage.
--
-- Run this in Supabase → SQL Editor. Safe to re-run (all "if not exists").
-- Does NOT touch or delete the old app_storage row — do that manually
-- only after the in-app migration tool confirms everything moved over.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── orders: one row per order (header / current-state record) ─────────
-- Hot fields used for filtering, sorting and search get real columns.
-- Everything else lives in `data` (jsonb) — exactly the rest of the order
-- object the app already works with, so the client barely has to change.
create table if not exists public.orders (
  id                     text primary key,             -- Date.now().toString(), unchanged
  step                   int  not null default 1,
  branch                 text,
  order_type             text not null default 'ccm',  -- 'ccm' | 'cash'
  stock_status           text,
  cancelled              boolean not null default false,
  cancelled_reason       text,
  customer_name          text,
  phone_model            text,
  agreement_number       text,
  invoice_no             text,
  merchant               text,

  -- Denormalized read-model fields — kept in sync by the app's write layer
  -- every time a history row is appended, so the list page never has to
  -- fetch history just to render a badge or a report row.
  short_payment_pending  boolean not null default false,
  pending_branch_action  boolean not null default false,
  last_history_date      text,
  last_history_time      text,
  step_dates             jsonb not null default '{}'::jsonb,   -- {"9":{"date":...,"time":...}, ...}
  last_verification      jsonb,                                -- latest step-9 (Collection Verified) entry

  data                   jsonb not null default '{}'::jsonb,   -- the long tail of order fields
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_orders_branch on public.orders(branch);
create index if not exists idx_orders_step on public.orders(step);
create index if not exists idx_orders_cancelled on public.orders(cancelled);
create index if not exists idx_orders_customer_name on public.orders(customer_name);
create index if not exists idx_orders_phone_model on public.orders(phone_model);

drop trigger if exists trg_orders_touch on public.orders;
create trigger trg_orders_touch
  before update on public.orders
  for each row execute function public.touch_updated_at();

alter table public.orders enable row level security;
drop policy if exists "Allow authenticated full access" on public.orders;
create policy "Allow authenticated full access"
  on public.orders for all to authenticated using (true) with check (true);

-- ─── order_history: append-only timeline, one row per tracking event ───
create table if not exists public.order_history (
  id         bigserial primary key,
  order_id   text not null references public.orders(id) on delete cascade,
  step       int not null,
  date       text,
  time       text,
  data       jsonb not null default '{}'::jsonb,   -- note, remark, files{path,name}, billingData, etc.
  created_at timestamptz not null default now()
);

create index if not exists idx_order_history_order_id on public.order_history(order_id);
create index if not exists idx_order_history_order_step on public.order_history(order_id, step);

alter table public.order_history enable row level security;
drop policy if exists "Allow authenticated full access" on public.order_history;
create policy "Allow authenticated full access"
  on public.order_history for all to authenticated using (true) with check (true);

-- ─── Storage bucket for files (replaces base64-in-JSON) ─────────────────
-- Private bucket — the app generates short-lived signed URLs to view/download
-- files rather than exposing them on a public, guessable URL (payment slips,
-- IC copies, agreements are sensitive).
insert into storage.buckets (id, name, public)
values ('order-files', 'order-files', false)
on conflict (id) do nothing;

drop policy if exists "order-files authenticated read" on storage.objects;
create policy "order-files authenticated read"
  on storage.objects for select to authenticated
  using (bucket_id = 'order-files');

drop policy if exists "order-files authenticated upload" on storage.objects;
create policy "order-files authenticated upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'order-files');

drop policy if exists "order-files authenticated update" on storage.objects;
create policy "order-files authenticated update"
  on storage.objects for update to authenticated
  using (bucket_id = 'order-files');

drop policy if exists "order-files authenticated delete" on storage.objects;
create policy "order-files authenticated delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'order-files');

-- ─── Notes ───────────────────────────────────────────────────────────────
-- 1. `public.touch_updated_at()` is reused from the original schema.sql —
--    run that file first if this is a brand new project.
-- 2. After the in-app "Migrate Legacy Orders" tool reports success and
--    you've spot-checked a few orders, you can retire the old blob:
--      delete from public.app_storage where key = 'emax_v5_orders';
-- 3. This schema intentionally keeps `data`/`step_dates`/`last_verification`
--    as jsonb rather than exploding every field into its own column —
--    that's the standard "header columns for what you filter/sort/report
--    on, jsonb for the rest" ERP pattern, and it means the 1200+ lines of
--    existing UI/business logic in OrderTab.jsx did not need to be rewritten.
