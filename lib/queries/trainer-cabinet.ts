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

// ── Етапи хореографії (екран /trainer/stages) ─────────────────────────────────
// Лише групові незаскасовані заняття тренера у вікні [from..to). Минулі потрібні
// для підказки «минулого разу», редагуються — майбутні (updateClassChoreoStage,
// RLS пускає тренера лише до своїх classes).

function trainerStageQuery(supabase: Db, trainerId: string, fromISO: string, toISO: string) {
  return supabase
    .from('classes')
    .select('id, series_id, title, ticket_type, starts_at, duration_min, choreo_stage, halls(name)')
    .eq('trainer_id', trainerId)
    .eq('ticket_type', 'group')
    .eq('is_cancelled', false)
    .gte('starts_at', fromISO)
    .lt('starts_at', toISO)
    .order('starts_at', { ascending: true })
}

export type TrainerStageClassRow = QueryData<ReturnType<typeof trainerStageQuery>>[number]

/** Групові заняття тренера у вікні [fromISO..toISO) для екрана етапів. */
export async function listMyStageClasses(
  supabase: Db,
  trainerId: string,
  fromISO: string,
  toISO: string
): Promise<{ data: TrainerStageClassRow[]; error: string | null }> {
  const { data, error } = await trainerStageQuery(supabase, trainerId, fromISO, toISO)
  return { data: data ?? [], error: error?.message ?? null }
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

// ── Постійники (екран /trainer/regulars) ───────────────────────────────────
// Тижневі шаблони (class_series, type='template') свого тренера +
// series_clients — RLS звужена міграцією 20260727_trainer_regulars_rls.sql
// (trainer_select_own на обох таблицях, лише власний trainer_id).

const TRAINER_REGULARS_SELECT =
  'id, ticket_type, title, day_of_week, time_of_day, duration_min, halls(name), series_clients(id, client_id, hours_attended, clients(first_name, last_name))' as const

function trainerRegularsQuery(supabase: Db, trainerId: string) {
  return supabase
    .from('class_series')
    .select(TRAINER_REGULARS_SELECT)
    .eq('trainer_id', trainerId)
    .eq('type', 'template')
    .order('day_of_week')
    .order('time_of_day')
}

export type TrainerRegularsSeriesRow = QueryData<ReturnType<typeof trainerRegularsQuery>>[number]

/** Тижневі шаблони тренера з переліком постійників (read-only). */
export async function listTrainerRegulars(
  supabase: Db,
  trainerId: string
): Promise<{ data: TrainerRegularsSeriesRow[]; error: string | null }> {
  const { data, error } = await trainerRegularsQuery(supabase, trainerId)
  return { data: data ?? [], error: error?.message ?? null }
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

// ── Зарплата (екран /trainer/salary) ──────────────────────────────────────────
// Нарахування й виплати — спільні calcTrainerSalaryDetail / listTrainerPayments
// (trainer-rates.ts; RPC і RLS пускають тренера лише до себе). Готівку тренер сам
// не порахує (нема RLS на sales/studio_expenses) → DEFINER-RPC my_trainer_cash.

export type MyTrainerCash = { cash_period: number; cash_total: number }

/** Готівка на руках поточного тренера: за період [from..to] (YYYY-MM-DD, Kyiv) і за весь час. */
export async function getMyTrainerCash(
  supabase: Db,
  from: string,
  to: string
): Promise<{ data: MyTrainerCash; error: string | null }> {
  const { data, error } = await supabase.rpc('my_trainer_cash', { p_from: from, p_to: to })
  const row = data?.[0]
  return {
    data: { cash_period: Number(row?.cash_period ?? 0), cash_total: Number(row?.cash_total ?? 0) },
    error: error?.message ?? null,
  }
}
