import type { SupabaseClient } from '@supabase/supabase-js'
import type { Hall } from '@/types'
import { refEntityQueries } from './_refEntity'

const q = refEntityQueries<Hall>('halls', 'id, name, capacity, description, is_active', { orderBy: 'name' })

export const listHalls = q.list
export const listActiveHalls = q.listActive
export const toggleHall = q.toggle

export async function insertHall(
  supabase: SupabaseClient,
  payload: { name: string; capacity: number; description: string | null; is_active: boolean }
): Promise<{ error: string | null }> {
  return q.insert(supabase, payload)
}
