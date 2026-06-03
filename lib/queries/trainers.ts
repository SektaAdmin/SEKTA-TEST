import type { Db } from '@/lib/queries/_db'
import type { Trainer } from '@/types'
import { refEntityQueries } from './_refEntity'

const q = refEntityQueries<'trainers', Trainer>(
  'trainers',
  'id, name, is_active, instagram_username, telegram_username, phone, email, user_id',
  { orderBy: 'name' }
)

export const listTrainers = q.list
export const listActiveTrainers = q.listActive
export const toggleTrainer = q.toggle

export async function insertTrainer(
  supabase: Db,
  payload: {
    name: string
    instagram_username: string | null
    telegram_username: string | null
    phone: string | null
    email: string | null
    is_active: boolean
  }
): Promise<{ error: string | null }> {
  return q.insert(supabase, payload)
}

/** Редагування довідкових полів тренера. user_id НЕ чіпаємо тут — кабінет лише через Route Handler. */
export async function updateTrainer(
  supabase: Db,
  id: string,
  payload: {
    name: string
    instagram_username: string | null
    telegram_username: string | null
    phone: string | null
    email: string | null
  }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('trainers').update(payload).eq('id', id)
  return { error: error?.message ?? null }
}
