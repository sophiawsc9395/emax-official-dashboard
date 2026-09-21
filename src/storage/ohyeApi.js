/**
 * OHYE! POS — storage API (Supabase-backed).
 * Mirrors the same row<->object mapping pattern used throughout this
 * project's other storage modules (see storage/ordersApi.js).
 */
import { supabase } from './index.js'

const MENU_TABLE = 'ohye_menu'
const BUNDLES_TABLE = 'ohye_bundles'
const ORDERS_TABLE = 'ohye_orders'
const SETTINGS_TABLE = 'ohye_settings'

/* ── Menu ──────────────────────────────────────────────────────────────── */

function rowToMenuItem(row) {
  return {
    id: row.id,
    cat: row.cat,
    name: row.name,
    price: parseFloat(row.price) || 0,
    hasCustom: row.has_custom,
    soldOut: row.sold_out,
    trackStock: row.track_stock,
    stockQty: parseFloat(row.stock_qty) || 0,
    variations: row.variations || [],
    sortOrder: row.sort_order || 0,
  }
}

function menuItemToRow(item) {
  return {
    id: item.id,
    cat: item.cat,
    name: item.name,
    price: item.price,
    has_custom: !!item.hasCustom,
    sold_out: !!item.soldOut,
    track_stock: !!item.trackStock,
    stock_qty: item.stockQty ?? 0,
    variations: item.variations || [],
    sort_order: item.sortOrder ?? 0,
    updated_at: new Date().toISOString(),
  }
}

export async function listMenu() {
  const { data, error } = await supabase.from(MENU_TABLE).select('*').order('sort_order')
  if (error) { console.error('listMenu error:', error); return [] }
  return (data || []).map(rowToMenuItem)
}

export async function saveMenuItem(item) {
  const { error } = await supabase.from(MENU_TABLE).upsert(menuItemToRow(item), { onConflict: 'id' })
  if (error) { console.error('saveMenuItem error:', error); return { ok: false, error } }
  return { ok: true }
}

export async function deleteMenuItem(id) {
  const { error } = await supabase.from(MENU_TABLE).delete().eq('id', id)
  if (error) { console.error('deleteMenuItem error:', error); return { ok: false, error } }
  return { ok: true }
}

// Atomically decrements stock for every stock-tracked line in a completed
// sale — reads current qty, subtracts, and auto-flips sold_out on once it
// reaches zero. Not wrapped in a single DB transaction (this project isn't
// set up with a Postgres RPC function for that), so under very rare
// simultaneous sales on two devices for the same item, one decrement could
// slightly undercount stock. Acceptable for a single-till shop; flag if a
// second till gets added and this needs to become a proper atomic RPC.
export async function decrementStockForSale(lines) {
  const trackedIds = [...new Set(lines.map(l => l.id))]
  if (!trackedIds.length) return
  const { data, error } = await supabase.from(MENU_TABLE).select('id,stock_qty,track_stock').in('id', trackedIds)
  if (error || !data) return
  const qtyById = {}
  lines.forEach(l => { qtyById[l.id] = (qtyById[l.id] || 0) + l.qty })
  for (const row of data) {
    if (!row.track_stock) continue
    const sold = qtyById[row.id] || 0
    if (!sold) continue
    const nextQty = Math.max(0, (parseFloat(row.stock_qty) || 0) - sold)
    await supabase.from(MENU_TABLE).update({ stock_qty: nextQty, sold_out: nextQty <= 0, updated_at: new Date().toISOString() }).eq('id', row.id)
  }
}

/* ── Bundles ───────────────────────────────────────────────────────────── */

function rowToBundle(row) {
  return { id: row.id, name: row.name, itemIds: row.item_ids || [], price: parseFloat(row.price) || 0 }
}
function bundleToRow(b) {
  return { id: b.id, name: b.name, item_ids: b.itemIds || [], price: b.price }
}

export async function listBundles() {
  const { data, error } = await supabase.from(BUNDLES_TABLE).select('*').order('created_at')
  if (error) { console.error('listBundles error:', error); return [] }
  return (data || []).map(rowToBundle)
}

export async function saveBundle(bundle) {
  const { error } = await supabase.from(BUNDLES_TABLE).upsert(bundleToRow(bundle), { onConflict: 'id' })
  if (error) { console.error('saveBundle error:', error); return { ok: false, error } }
  return { ok: true }
}

export async function deleteBundle(id) {
  const { error } = await supabase.from(BUNDLES_TABLE).delete().eq('id', id)
  if (error) { console.error('deleteBundle error:', error); return { ok: false, error } }
  return { ok: true }
}

/* ── Orders ────────────────────────────────────────────────────────────── */

function rowToOrder(row) {
  return {
    number: row.number,
    time: new Date(row.time),
    lines: row.lines || [],
    subtotal: parseFloat(row.subtotal) || 0,
    discount: row.discount || null,
    discountAmount: parseFloat(row.discount_amount) || 0,
    sst: parseFloat(row.sst) || 0,
    total: parseFloat(row.total) || 0,
    amountCollected: parseFloat(row.amount_collected) || 0,
    roundingAdjustment: parseFloat(row.rounding_adjustment) || 0,
    paymentMethod: row.payment_method,
    cashReceived: row.cash_received != null ? parseFloat(row.cash_received) : null,
    changeGiven: row.change_given != null ? parseFloat(row.change_given) : null,
    splitCash: row.split_cash != null ? parseFloat(row.split_cash) : null,
    splitQr: row.split_qr != null ? parseFloat(row.split_qr) : null,
    refunded: row.refunded,
    refundedAt: row.refunded_at ? new Date(row.refunded_at) : undefined,
  }
}

function orderToRow(o) {
  return {
    number: o.number,
    time: (o.time instanceof Date ? o.time : new Date(o.time)).toISOString(),
    lines: o.lines,
    subtotal: o.subtotal,
    discount: o.discount || null,
    discount_amount: o.discountAmount || 0,
    sst: o.sst,
    total: o.total,
    amount_collected: o.amountCollected,
    rounding_adjustment: o.roundingAdjustment || 0,
    payment_method: o.paymentMethod,
    cash_received: o.cashReceived,
    change_given: o.changeGiven,
    split_cash: o.splitCash,
    split_qr: o.splitQr,
    refunded: !!o.refunded,
    refunded_at: o.refundedAt ? (o.refundedAt instanceof Date ? o.refundedAt.toISOString() : o.refundedAt) : null,
  }
}

// Loads every order ever recorded — fine at this business's current scale
// (a single takeaway shop). If order volume grows enough that this gets
// slow, switch to date-ranged fetches per report period instead of one
// full-history load; not needed yet.
export async function listOrders() {
  const { data, error } = await supabase.from(ORDERS_TABLE).select('*').order('time', { ascending: true })
  if (error) { console.error('listOrders error:', error); return [] }
  return (data || []).map(rowToOrder)
}

export async function createOrder(order) {
  const { error } = await supabase.from(ORDERS_TABLE).insert(orderToRow(order))
  if (error) { console.error('createOrder error:', error); return { ok: false, error } }
  await decrementStockForSale(order.lines)
  return { ok: true }
}

export async function refundOrder(number) {
  const { error } = await supabase.from(ORDERS_TABLE).update({ refunded: true, refunded_at: new Date().toISOString() }).eq('number', number)
  if (error) { console.error('refundOrder error:', error); return { ok: false, error } }
  return { ok: true }
}

/* ── Settings (single row) ────────────────────────────────────────────── */

function rowToSettings(row) {
  return {
    name: row.name,
    ssm: row.ssm || '',
    address: row.address || '',
    sstRegistered: row.sst_registered,
    sstNo: row.sst_no || '',
    sstRate: parseFloat(row.sst_rate) || 0,
    managerPassword: row.manager_password,
    discountPassword: row.discount_password,
    autoPrintReceipt: row.auto_print_receipt,
    autoPrintLabels: row.auto_print_labels,
  }
}

export async function getSettings() {
  const { data, error } = await supabase.from(SETTINGS_TABLE).select('*').eq('id', 1).maybeSingle()
  if (error || !data) { console.error('getSettings error:', error); return null }
  return rowToSettings(data)
}

export async function saveSettings(biz) {
  const { error } = await supabase.from(SETTINGS_TABLE).update({
    name: biz.name, ssm: biz.ssm, address: biz.address,
    sst_registered: biz.sstRegistered, sst_no: biz.sstNo, sst_rate: biz.sstRate,
    manager_password: biz.managerPassword, discount_password: biz.discountPassword,
    auto_print_receipt: biz.autoPrintReceipt, auto_print_labels: biz.autoPrintLabels,
  }).eq('id', 1)
  if (error) { console.error('saveSettings error:', error); return { ok: false, error } }
  return { ok: true }
}

// Read-then-write increment — see decrementStockForSale's comment above on
// why this isn't a true atomic RPC. Returns the sequence number to use for
// THIS order (e.g. 182), having already reserved 183 for the next one.
export async function nextOrderSeq() {
  const { data, error } = await supabase.from(SETTINGS_TABLE).select('order_seq').eq('id', 1).maybeSingle()
  if (error || !data) { console.error('nextOrderSeq error:', error); return null }
  const current = data.order_seq
  await supabase.from(SETTINGS_TABLE).update({ order_seq: current + 1 }).eq('id', 1)
  return current
}
