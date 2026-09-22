-- ═══════════════════════════════════════════════════════════════════════
-- ONE-TIME MIGRATION — old Purchase Order page → new 4-stage workflow
--
-- The old page kept its working data (supplier price quotes, Purchase's
-- remark) in a separate blob at app_storage.key = 'emax_v5_purchase_order_supp',
-- keyed by order id. The new page reads everything straight off the order
-- row itself (poStage, poPrices, poPurchaserRemark, poApproverRemark) so
-- it can ride the same Realtime subscription Order Tracking already uses.
-- This script carries forward anything still sitting unfinished in that
-- old blob before the new page goes live, so nothing already typed in
-- gets silently lost.
--
-- Run this ONCE in Supabase → SQL Editor, AFTER deploying the new build
-- but it's safe to run before too — it only touches orders still at
-- Step 1 (not yet ordered), which the new page treats identically either
-- way. Safe to re-run: an order that has already been migrated (or never
-- had anything worth migrating) is simply skipped the second time.
--
-- What this deliberately does NOT touch: any order already marked
-- "ordered" in the old blob (step >= 2) already has its real purchase
-- details (order date, supplier, PO number, etc.) written directly onto
-- the order itself — that's how the old page's "Confirm Ordered" already
-- worked — so there's nothing left in the blob for those that isn't
-- already correctly on the order.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  blob jsonb;
  order_id text;
  rec jsonb;
  prices jsonb;
  remark text;
  is_ordered boolean;
  cur_step int;
  has_prices boolean;
  migrated_count int := 0;
  skipped_count int := 0;
begin
  select value::jsonb into blob
  from public.app_storage
  where key = 'emax_v5_purchase_order_supp';

  if blob is null then
    raise notice 'No old Purchase Order data found (app_storage key not present) — nothing to migrate.';
    return;
  end if;

  for order_id, rec in select * from jsonb_each(blob)
  loop
    is_ordered := coalesce((rec->>'ordered')::boolean, false);
    prices := coalesce(rec->'prices', '{}'::jsonb);
    remark := nullif(trim(coalesce(rec->>'remark', '')), '');
    has_prices := coalesce((
      select bool_or((prices->>key)::numeric > 0)
      from jsonb_object_keys(prices) as key
    ), false);

    -- Nothing worth carrying over for this entry.
    if is_ordered or (not has_prices and remark is null) then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select step into cur_step from public.orders where id = order_id;

    -- Order no longer exists, or has already moved past Step 1 through
    -- some other path since the blob was last written — nothing to do.
    if cur_step is null or cur_step > 1 then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    update public.orders
    set data = data
      || jsonb_build_object('poStage', 'submitted')
      || jsonb_build_object('poPrices', prices)
      || case when remark is not null
           then jsonb_build_object('poPurchaserRemark', remark)
           else '{}'::jsonb
         end
    where id = order_id;

    migrated_count := migrated_count + 1;
  end loop;

  raise notice 'Purchase Order migration done — % order(s) migrated to Submitted, % skipped (already ordered, nothing to carry over, or order not found).', migrated_count, skipped_count;
end $$;
