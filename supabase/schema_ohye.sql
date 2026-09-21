-- ═══════════════════════════════════════════════════════════════════════
-- OHYE! POS — real backend schema
-- Separate business from EMAX Network, sharing this same Supabase project
-- purely for auth/hosting convenience (see ohye-main.jsx).
--
-- Run this in Supabase → SQL Editor. Safe to re-run (all "if not exists").
-- ═══════════════════════════════════════════════════════════════════════

-- ─── ohye_menu: one row per menu item ───────────────────────────────────
-- track_stock/stock_qty are new — the original layout preview only had
-- soldOut (a manual on/off switch), not an actual quantity. An item with
-- track_stock=false behaves exactly like before (manual sold-out only);
-- track_stock=true additionally decrements stock_qty automatically on
-- every sale, and auto-flips sold_out on once it hits zero.
create table if not exists public.ohye_menu (
  id           text primary key,
  cat          text not null,
  name         text not null,
  price        numeric not null default 0,
  has_custom   boolean not null default false,
  sold_out     boolean not null default false,
  track_stock  boolean not null default false,
  stock_qty    numeric not null default 0,
  variations   jsonb not null default '[]'::jsonb,
  photo_url    text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Safe to re-run against a table that already existed before this column
-- was added (create table if not exists above won't add it to an
-- existing table on its own).
alter table public.ohye_menu add column if not exists photo_url text;

-- ─── ohye_bundles: set/combo promotions ─────────────────────────────────
create table if not exists public.ohye_bundles (
  id           text primary key,
  name         text not null,
  item_ids     jsonb not null default '[]'::jsonb,
  price        numeric not null default 0,
  created_at   timestamptz not null default now()
);

-- ─── ohye_orders: one row per completed order ───────────────────────────
-- number (e.g. "INV-0182") is the primary key — it's how the rest of the
-- app already identifies an order (refunds, receipt/label reprints), so
-- keeping it as the actual key avoids a separate id<->number mapping.
create table if not exists public.ohye_orders (
  number              text primary key,
  time                timestamptz not null default now(),
  lines               jsonb not null default '[]'::jsonb,
  subtotal            numeric not null default 0,
  discount            jsonb,
  discount_amount     numeric not null default 0,
  sst                 numeric not null default 0,
  total               numeric not null default 0,
  amount_collected    numeric not null default 0,
  rounding_adjustment numeric not null default 0,
  payment_method      text,
  cash_received       numeric,
  change_given        numeric,
  split_cash          numeric,
  split_qr            numeric,
  refunded            boolean not null default false,
  refunded_at         timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idx_ohye_orders_time on public.ohye_orders(time);

-- ─── ohye_settings: single-row business settings + order sequence ──────
-- order_seq replaces the in-memory orderSeq counter — persisted so
-- receipt numbers keep incrementing correctly across reloads/devices
-- instead of restarting from the same number every time the page opens.
create table if not exists public.ohye_settings (
  id                    int primary key default 1,
  name                  text not null default 'OHYE!',
  ssm                   text,
  address               text,
  sst_registered        boolean not null default false,
  sst_no                text,
  sst_rate              numeric not null default 6,
  manager_password      text not null default '1234',
  discount_password     text not null default '1234',
  auto_print_receipt    boolean not null default true,
  auto_print_labels     boolean not null default true,
  order_seq             int not null default 182,
  constraint ohye_settings_single_row check (id = 1)
);
insert into public.ohye_settings (id) values (1) on conflict (id) do nothing;

-- ─── RLS: authenticated users only (AuthGate already restricts by email
-- at the app level — this just keeps anonymous/unauthenticated requests
-- out entirely) ──────────────────────────────────────────────────────────
alter table public.ohye_menu enable row level security;
alter table public.ohye_bundles enable row level security;
alter table public.ohye_orders enable row level security;
alter table public.ohye_settings enable row level security;

drop policy if exists "Allow authenticated full access" on public.ohye_menu;
create policy "Allow authenticated full access" on public.ohye_menu
  for all to authenticated using (true) with check (true);

drop policy if exists "Allow authenticated full access" on public.ohye_bundles;
create policy "Allow authenticated full access" on public.ohye_bundles
  for all to authenticated using (true) with check (true);

drop policy if exists "Allow authenticated full access" on public.ohye_orders;
create policy "Allow authenticated full access" on public.ohye_orders
  for all to authenticated using (true) with check (true);

drop policy if exists "Allow authenticated full access" on public.ohye_settings;
create policy "Allow authenticated full access" on public.ohye_settings
  for all to authenticated using (true) with check (true);

-- ─── Seed the default menu/bundle, only if the table is currently empty —
-- safe to re-run, won't duplicate or overwrite anything once real data
-- exists ──────────────────────────────────────────────────────────────
insert into public.ohye_menu (id, cat, name, price, has_custom, sold_out, sort_order)
select * from (values
  ('c1','Drinks','Kopi O',3.0,true,false,1),
  ('c2','Drinks','Kopi C Peng',4.5,true,false,2),
  ('c3','Drinks','Latte',7.0,true,false,3),
  ('t1','Drinks','Teh Tarik',3.5,true,false,4),
  ('t2','Drinks','Teh O Ais Limau',4.0,true,false,5),
  ('j1','Drinks','Fresh Orange',5.5,true,false,6),
  ('j2','Drinks','Sirap Bandung',3.5,true,false,7),
  ('f2','Food','Roti Canai',2.5,false,false,9),
  ('f3','Food','Mee Goreng',7.5,false,false,10)
) as v(id,cat,name,price,has_custom,sold_out,sort_order)
where not exists (select 1 from public.ohye_menu);

insert into public.ohye_menu (id, cat, name, price, has_custom, sold_out, variations, sort_order)
select 'f1','Food','Nasi Lemak',8.0,false,false,'[{"id":"f1-lg","name":"Large","price":10.0}]'::jsonb,8
where not exists (select 1 from public.ohye_menu where id='f1');

insert into public.ohye_bundles (id, name, item_ids, price)
select 'b1','Breakfast Set','["f2","c1"]'::jsonb,5.0
where not exists (select 1 from public.ohye_bundles);

-- ─── Storage bucket for menu item photos ────────────────────────────────
-- Public bucket (unlike order-files) — these are just product photos
-- shown on the order-taking screen, nothing sensitive, so a plain public
-- URL is simpler than generating signed URLs every time a menu card
-- renders.
insert into storage.buckets (id, name, public)
values ('ohye-menu-photos', 'ohye-menu-photos', true)
on conflict (id) do nothing;

drop policy if exists "ohye-menu-photos public read" on storage.objects;
create policy "ohye-menu-photos public read"
  on storage.objects for select
  using (bucket_id = 'ohye-menu-photos');

drop policy if exists "ohye-menu-photos authenticated upload" on storage.objects;
create policy "ohye-menu-photos authenticated upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'ohye-menu-photos');

drop policy if exists "ohye-menu-photos authenticated update" on storage.objects;
create policy "ohye-menu-photos authenticated update"
  on storage.objects for update to authenticated
  using (bucket_id = 'ohye-menu-photos');

drop policy if exists "ohye-menu-photos authenticated delete" on storage.objects;
create policy "ohye-menu-photos authenticated delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'ohye-menu-photos');
