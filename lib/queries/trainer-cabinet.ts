import type { Db } from '@/lib/queries/_db'
import type { QueryData } from '@supabase/supabase-js'
import { sanitizePostgrestSearch } from './_escape'

export type MyTrainer = {
  id: string
  name: string
  telegram_chat_id: number | null
  telegram_link_token: string
}

/** trainers-картка, привʼязана до поточного auth-user (кабінет тренера). */
export async function getMyTrainer(
  supabase: Db,
  userId: string
): Promise<{ data: MyTrainer | null; error: string | null }> {
  const { data, error } = await supabase
    .from('trainers')
    .select('id, name, telegram_chat_id, telegram_link_token')
    .eq('user_id', userId)
    .maybeSingle()
  return { data, error: error?.message ?? null }
}

const TRAINER_CLASSES_SELECT =
  'id, ticket_type, title, starts_at, duration_min, capacity, is_cancelled, choreo_stage, halls(name), enrollments(id, status, clients(first_name, last_name))' as const

function trainerUpcomingQuery(supabase: Db, trainerId: string, fromISO: string) {
  return supabase
    .from('classes')
    .select(TRAINER_CLASSES_SELECT)
    .eq('trainer_id', trainerId)
    .gte('starts_at', fromISO)
    .order('starts_at', { ascending: true })
}

export type TrainerClassRow = QueryData<ReturnType<typeof trainerUpcomingQuery>>[number]

/** Майбутні заняття тренера (від початку поточного дня). */
export async function listMyUpcomingClasses(
  supabase: Db,
  trainerId: string,
  fromISO: string
): Promise<{ data: TrainerClassRow[]; error: string | null }> {
  const { data, error } = await trainerUpcomingQuery(supabase, trainerId, fromISO)
  return { data: data ?? [], error: error?.message ?? null }
}

/** Минулі заняття тренера (до початку поточного дня), сортування від нових. */
export async function listMyPastClasses(
  supabase: Db,
  trainerId: string,
  beforeISO: string
): Promise<{ data: TrainerClassRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('classes')
    .select(TRAINER_CLASSES_SELECT)
    .eq('trainer_id', trainerId)
    .lt('starts_at', beforeISO)
    .order('starts_at', { ascending: false })
    .limit(50)
  return { data: (data as TrainerClassRow[]) ?? [], error: error?.message ?? null }
}

// ── Клієнти (екран /trainer/clients) ──────────────────────────────────────────
// Тренер за RLS бачить лише clients (ім'я+баланс), БЕЗ контактів (вони в
// client_contacts, куди тренеру доступ закрито). Тому читаємо clients напряму —
// контакти сюди не потрапляють by design.

export type TrainerClientRow = {
  id: string
  first_name: string | null
  last_name: string | null
  balance: number
}

export interface ListTrainerClientsParams {
  search: string
  page: number
  pageSize: number
}

/** Список клієнтів для кабінету тренера: ім'я + баланс, без контактів. */
export async function listTrainerClients(
  supabase: Db,
  { search, page, pageSize }: ListTrainerClientsParams
): Promise<{ data: TrainerClientRow[]; count: number; error: string | null }> {
  let query = supabase
    .from('clients')
    .select('id, first_name, last_name, balance', { count: 'exact' })
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  // Пошук лише по імені/прізвищу — телефон тренеру недоступний.
  if (search.trim()) {
    const s = sanitizePostgrestSearch(search)
    if (s) query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%`)
  }

  const from = page * pageSize
  query = query.range(from, from + pageSize - 1)

  const { data, count, error } = await query
  return { data: (data as TrainerClientRow[]) ?? [], count: count ?? 0, error: error?.message ?? null }
}

export interface CreateClientPayload {
  first_name: string
  last_name: string
  phone?: string
  instagram_username?: string
  telegram_username?: string
}

/**
 * Створити клієнта через серверний API (service-role): дедуп по телефону/імені
 * та запис у client_contacts робить сервер, бо тренеру контакти недоступні.
 * Повертає код помилки (для локалізованого повідомлення) або null.
 */
export async function createClientViaApi(
  payload: CreateClientPayload
): Promise<{ error: string | null }> {
  const res = await fetch('/api/admin/create-client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.ok) return { error: null }
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return { error: body.error ?? 'unknown' }
}
