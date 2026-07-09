/**
 * Storage adapter — Supabase-backed.
 * Exposes the same loadData/saveData API the rest of the app uses.
 *
 * Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to be set.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const TABLE = 'app_storage'

export async function loadData(key) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('value')
      .eq('key', key)
      .maybeSingle()
    if (error) {
      console.error('loadData error:', key, error)
      return null
    }
    if (!data) return null
    // value column is text — parse it back to the original JS value
    try {
      return JSON.parse(data.value)
    } catch {
      return data.value  // fallback: return raw string if not valid JSON
    }
  } catch (e) {
    console.error('loadData exception:', key, e)
    return null
  }
}

export async function saveData(key, value) {
  try {
    // null/undefined = delete the row (used by PDF delete)
    if (value === null || value === undefined) {
      const { error } = await supabase.from(TABLE).delete().eq('key', key)
      if (error) console.error('saveData delete error:', key, error)
      return
    }
    // Always stringify before storing — value column is text
    const { error } = await supabase
      .from(TABLE)
      .upsert({ key, value: JSON.stringify(value) }, { onConflict: 'key' })
    if (error) console.error('saveData error:', key, error)
  } catch (e) {
    console.error('saveData exception:', key, e)
  }
}

// Kept for parity with any code that imports { storage } directly
export const storage = {
  async get(key) {
    const value = await loadData(key)
    if (value === null) return null
    return { key, value: JSON.stringify(value) }
  },
  async set(key, value) {
    await saveData(key, JSON.parse(value))
    return { key, value }
  },
  async delete(key) {
    await saveData(key, null)
    return { key, deleted: true }
  },
  async list(prefix = '') {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('key')
        .like('key', `${prefix}%`)
      if (error) {
        console.error('list error:', error)
        return { keys: [] }
      }
      return { keys: data.map(r => r.key), prefix }
    } catch (e) {
      console.error('list exception:', e)
      return { keys: [] }
    }
  },
}
