/**
 * Storage adapter — Supabase-backed.
 * Exposes the exact same loadData/saveData API the rest of the app already
 * uses, so no component code needs to change.
 *
 * Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to be set
 * (see .env.example). These are safe to expose in frontend code — access
 * is controlled by Row Level Security policies on the Supabase side.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
    'in your environment (see .env.example).'
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
    if (!data) return null // ← null (not {}) so || fallbacks work correctly
    return data.value
  } catch (e) {
    console.error('loadData exception:', key, e)
    return null
  }
}

export async function saveData(key, value) {
  try {
    // Saving `null`/`undefined` deletes the key (used by PDF delete feature)
    if (value === null || value === undefined) {
      const { error } = await supabase.from(TABLE).delete().eq('key', key)
      if (error) console.error('saveData delete error:', key, error)
      return
    }
    const { error } = await supabase
      .from(TABLE)
      .upsert({ key, value }, { onConflict: 'key' })
    if (error) console.error('saveData error:', key, error)
  } catch (e) {
    console.error('saveData exception:', key, e)
  }
}

// Kept for parity with the old storage object some files imported directly.
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
