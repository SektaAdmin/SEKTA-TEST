import type { Db } from '@/lib/queries/_db'
import type { Trainer } from '@/types'
import { refEntityQueries } from './_refEntity'

// Lean-список (без phone/email): колонковий бар'єр RLS не дає client/trainer читати контакти
// з trainers. Загальний список (RefsContext/розклади/ClassModal/salary) потребує лише name/id.
const q = refEntityQueries<'trainers', Trainer>(
  'trainers',
  'id, name, is_active, instagram_username, telegram_username, user_id',
  { orderBy: 'name' }
)

export const listTrainers = q.list
export const listActiveTrainers = q.listActive
export const toggleTrainer = q.toggle

/** Повний список тренерів із контактами (phone/email) для сторінки персоналу.
 *  Через gated RPC list_trainers_admin (owner/admin), бо прямий SELECT phone/email
 *  із таблиці заборонено колонковим бар'єром для всіх authenticated. */
export async function listTrainersAdmin(
  supabase: Db
): Promise<{ data: Trainer[]; error: string | null }> {
  const { data, error } = await supabase.rpc('list_trainers_admin')
  return { data: (data as Trainer[]) ?? [], error: error?.message ?? null }
}

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
