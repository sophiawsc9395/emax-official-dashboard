import { supabase, loadData } from './index.js'

const LEGACY_ORDER_KEY = 'emax_v5_orders'
const ORDERS_TABLE = 'orders'

function normaliseOrder(order) {
  return {
    id: String(order.id),
    branch: order.branch || null,
    step: Number(order.step) || 1,
    customer_name: order.customerName || null,
    phone_model: order.phoneModel || null,
    agreement_number: order.agreementNumber || null,
    updated_at: new Date().toISOString(),
    data: order,
  }
}

function isMissingTableError(error) {
  return error?.code === '42P01' || /relation .*orders.* does not exist/i.test(error?.message || '')
}

export async function loadOrders() {
  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .select('data')
    .order('updated_at', { ascending: false })

  if (error) {
    if (isMissingTableError(error)) {
      console.warn('Orders table is not created yet. Falling back to legacy app_storage data.')
      const legacy = await loadData(LEGACY_ORDER_KEY, true)
      return Array.isArray(legacy) ? legacy : []
    }
    console.error('loadOrders error:', error)
    return []
  }

  if (data?.length) return data.map(row => row.data).filter(Boolean)

  // One-time automatic migration from the old giant JSON record.
  const legacy = await loadData(LEGACY_ORDER_KEY, true)
  if (!Array.isArray(legacy) || legacy.length === 0) return []

  const result = await upsertOrders(legacy)
  if (!result.ok) return legacy

  return legacy
}

export async function upsertOrder(order) {
  const { error } = await supabase
    .from(ORDERS_TABLE)
    .upsert(normaliseOrder(order), { onConflict: 'id' })

  if (error) {
    console.error('upsertOrder error:', error)
    return { ok: false, error }
  }

  return { ok: true }
}

export async function upsertOrders(orders) {
  if (!orders.length) return { ok: true }

  const rows = orders.map(normaliseOrder)
  const CHUNK_SIZE = 100

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const { error } = await supabase
      .from(ORDERS_TABLE)
      .upsert(rows.slice(i, i + CHUNK_SIZE), { onConflict: 'id' })

    if (error) {
      console.error('upsertOrders error:', error)
      return { ok: false, error }
    }
  }

  return { ok: true }
}

export async function deleteOrderRow(id) {
  const { error } = await supabase
    .from(ORDERS_TABLE)
    .delete()
    .eq('id', String(id))

  if (error) {
    console.error('deleteOrderRow error:', error)
    return { ok: false, error }
  }

  return { ok: true }
}

// Used by bulk actions. Only changed rows are uploaded; removed rows are deleted.
export async function syncOrders(previousOrders, nextOrders) {
  const previousById = new Map(previousOrders.map(order => [String(order.id), order]))
  const nextById = new Map(nextOrders.map(order => [String(order.id), order]))

  const changed = nextOrders.filter(order => {
    const previous = previousById.get(String(order.id))
    return !previous || JSON.stringify(previous) !== JSON.stringify(order)
  })

  const removedIds = previousOrders
    .filter(order => !nextById.has(String(order.id)))
    .map(order => String(order.id))

  const saveResult = await upsertOrders(changed)
  if (!saveResult.ok) return saveResult

  if (removedIds.length) {
    const { error } = await supabase
      .from(ORDERS_TABLE)
      .delete()
      .in('id', removedIds)

    if (error) {
      console.error('syncOrders delete error:', error)
      return { ok: false, error }
    }
  }

  return { ok: true }
}
