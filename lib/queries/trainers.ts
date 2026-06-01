import type { SupabaseClient } from '@supabase/supabase-js'
import type { Trainer } from '@/types'
import { refEntityQueries } from './_refEntity'

const q = refEntityQueries<Trainer>(
  'trainers',
  'id, name, is_active, instagram_username, telegram_username',
  { orderBy: 'name' }
)

export const listTrainers = q.list
export const listActiveTrainers = q.listActive
export const toggleTrainer = q.toggle

export async function insertTrainer(
  supabase: SupabaseClient,
  payload: { name: string; instagram_username: string | null; telegram_username: string | null; is_active: boolean }
): Promise<{ error: string | null }> {
  return q.insert(supabase, payload)
}
