-- Run this once in Supabase Dashboard > SQL Editor.
-- It creates one database row per order while keeping your existing order structure in JSONB.

create table if not exists public.orders (
  id text primary key,
  branch text,
  step integer not null default 1,
  customer_name text,
  phone_model text,
  agreement_number text,
  updated_at timestamptz not null default now(),
  data jsonb not null
);

create index if not exists orders_updated_at_idx on public.orders (updated_at desc);
create index if not exists orders_branch_idx on public.orders (branch);
create index if not exists orders_step_idx on public.orders (step);
create index if not exists orders_branch_step_idx on public.orders (branch, step);
create index if not exists orders_customer_name_idx on public.orders (lower(customer_name));
create index if not exists orders_phone_model_idx on public.orders (lower(phone_model));
create index if not exists orders_agreement_number_idx on public.orders (lower(agreement_number));

alter table public.orders enable row level security;

-- Matches the current frontend access model using the anon/authenticated Supabase client.
-- Tighten these policies later when your role-based Supabase authentication is ready.
drop policy if exists "orders_select" on public.orders;
drop policy if exists "orders_insert" on public.orders;
drop policy if exists "orders_update" on public.orders;
drop policy if exists "orders_delete" on public.orders;

create policy "orders_select" on public.orders for select to anon, authenticated using (true);
create policy "orders_insert" on public.orders for insert to anon, authenticated with check (true);
create policy "orders_update" on public.orders for update to anon, authenticated using (true) with check (true);
create policy "orders_delete" on public.orders for delete to anon, authenticated using (true);
