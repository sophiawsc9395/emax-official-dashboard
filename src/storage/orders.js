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

function applyCommonFilters(query, { branch = 'ALL', userBranch = null, steps = null, completed = false, search = '' } = {}) {
  const effectiveBranch = userBranch || (branch !== 'ALL' ? branch : null)
  if (effectiveBranch) query = query.eq('branch', effectiveBranch)

  if (Array.isArray(steps) && steps.length) query = query.in('step', steps)
  else if (completed) query = query.eq('step', 14)
  else query = query.neq('step', 14)

  const term = String(search || '').trim().replace(/[(),%]/g, ' ')
  if (term) {
    query = query.or(
      `customer_name.ilike.%${term}%,phone_model.ilike.%${term}%,agreement_number.ilike.%${term}%`
    )
  }

  return query
}

export async function loadOrdersPage({
  page = 1,
  pageSize = 25,
  branch = 'ALL',
  userBranch = null,
  steps = null,
  completed = false,
  search = '',
} = {}) {
  const from = Math.max(0, (page - 1) * pageSize)
  const to = from + pageSize - 1

  let query = supabase
    .from(ORDERS_TABLE)
    .select('data', { count: 'exact' })

  query = applyCommonFilters(query, { branch, userBranch, steps, completed, search })

  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(from, to)

  if (error) {
    if (isMissingTableError(error)) {
      console.warn('Orders table is not created yet. Falling back to legacy app_storage data.')
      const legacy = await loadData(LEGACY_ORDER_KEY, true)
      const list = Array.isArray(legacy) ? legacy : []
      return { orders: list.slice(from, to + 1), count: list.length, legacy: true }
    }
    console.error('loadOrdersPage error:', error)
    return { orders: [], count: 0, error }
  }

  return {
    orders: (data ?? []).map(row => row.data).filter(Boolean),
    count: count ?? 0,
  }
}

export async function loadOrderById(id) {
  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .select('data')
    .eq('id', String(id))
    .maybeSingle()

  if (error) {
    console.error('loadOrderById error:', error)
    return null
  }

  return data?.data ?? null
}

export async function loadOrdersForAction({ userBranch = null, branch = 'ALL', steps = null, completed = false, search = '' } = {}) {
  let query = supabase.from(ORDERS_TABLE).select('data')
  query = applyCommonFilters(query, { branch, userBranch, steps, completed, search })

  const { data, error } = await query.order('updated_at', { ascending: false })
  if (error) {
    console.error('loadOrdersForAction error:', error)
    return []
  }
  return (data ?? []).map(row => row.data).filter(Boolean)
}

async function countWithFilters(filters = {}) {
  let query = supabase.from(ORDERS_TABLE).select('id', { count: 'exact', head: true })
  query = applyCommonFilters(query, filters)
  const { count, error } = await query
  if (error) {
    console.error('count orders error:', error)
    return 0
  }
  return count ?? 0
}

export async function loadOrderCounts({ userBranch = null } = {}) {
  const phaseSteps = {
    stock: [1, 2, 3],
    transfer: [4, 5],
    billing: [6, 7, 8, 9],
    agreement_hq: [10],
    unclaimed: [11],
    claimed: [12, 13],
  }

  const entries = await Promise.all(
    Object.entries(phaseSteps).map(async ([key, steps]) => [
      key,
      await countWithFilters({ userBranch, steps }),
    ])
  )

  const completed = await countWithFilters({ userBranch, completed: true })
  const phaseCounts = Object.fromEntries(entries)
  const active = Object.values(phaseCounts).reduce((sum, value) => sum + value, 0)

  return { phaseCounts, active, completed }
}

// Kept for reports and migration tools that deliberately need the whole dataset.
export async function loadOrders() {
  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .select('data')
    .order('updated_at', { ascending: false })

  if (error) {
    if (isMissingTableError(error)) {
      const legacy = await loadData(LEGACY_ORDER_KEY, true)
      return Array.isArray(legacy) ? legacy : []
    }
    console.error('loadOrders error:', error)
    return []
  }

  if (data?.length) return data.map(row => row.data).filter(Boolean)

  const legacy = await loadData(LEGACY_ORDER_KEY, true)
  if (!Array.isArray(legacy) || legacy.length === 0) return []

  const result = await upsertOrders(legacy)
  return result.ok ? legacy : legacy
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
