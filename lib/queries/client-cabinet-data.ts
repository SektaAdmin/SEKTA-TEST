import type { Db } from '@/lib/queries/_db'
import type { QueryData } from '@supabase/supabase-js'

/** clients-картка, привʼязана до поточного auth-user (кабінет клієнта). */
export async function getMyClient(
  supabase: Db,
  userId: string
): Promise<{ data: { id: string; first_name: string | null; last_name: string | null; balance: number } | null; error: string | null }> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, first_name, last_name, balance')
    .eq('user_id', userId)
    .maybeSingle()
  return { data, error: error?.message ?? null }
}

/** Контакти клієнта (read-only у кабінеті). client_contacts: 1:1 clients, RLS client_select_own. */
export async function getMyContacts(
  supabase: Db,
  clientId: string
): Promise<{ data: { phone: string | null; instagram_username: string | null; telegram_username: string | null } | null; error: string | null }> {
  const { data, error } = await supabase
    .from('client_contacts')
    .select('phone, instagram_username, telegram_username')
    .eq('client_id', clientId)
    .maybeSingle()
  return { data, error: error?.message ?? null }
}

/** Залишки занять по типах (усі куплені типи крім striprental).
 *  Сортування — на фронті по sort_order з окремого запиту до training_types. */
export async function listMySessionBalances(
  supabase: Db,
  clientId: string
): Promise<{ data: { ticket_type: string; sessions_balance: number }[]; error: string | null }> {
  const [balRes, ttRes] = await Promise.all([
    supabase
      .from('client_session_balances')
      .select('ticket_type, sessions_balance')
      .eq('client_id', clientId)
      .neq('ticket_type', 'striprental'),
    supabase
      .from('training_types')
      .select('code, sort_order')
      .order('sort_order', { ascending: true }),
  ])
  if (balRes.error) return { data: [], error: balRes.error.message }

  const sortMap: Record<string, number> = {}
  for (const t of (ttRes.data ?? [])) sortMap[t.code] = t.sort_order ?? 999

  const rows = (balRes.data ?? []).sort(
    (a, b) => (sortMap[a.ticket_type] ?? 999) - (sortMap[b.ticket_type] ?? 999)
  )
  return { data: rows, error: null }
}

const MY_ENROLLMENTS_SELECT =
  'id, status, class_id, hours_attended, classes(id, ticket_type, title, starts_at, duration_min, is_cancelled, trainers(name), halls(name))' as const

function myUpcomingEnrollmentsQuery(supabase: Db, clientId: string, fromISO: string) {
  return supabase
    .from('enrollments')
    .select(MY_ENROLLMENTS_SELECT)
    .eq('client_id', clientId)
    .in('status', ['enrolled', 'waitlist'])
    .gte('classes.starts_at', fromISO)
}

export type MyEnrollmentRow = QueryData<ReturnType<typeof myUpcomingEnrollmentsQuery>>[number]

/**
 * Наростаючий залишок сесій ПІСЛЯ кожного майбутнього запису клієнта
 * (enrollment.id → balance_after). Серверний RPC рахує кумулятив по ВСІХ
 * майбутніх записах (не по видимому slice), тож пагінація в UI не ламає
 * хронологію. Дзеркало семантики get_session_balance_after, але running.
 */
export async function listMyRunningBalances(
  supabase: Db,
  clientId: string,
  fromISO: string
): Promise<{ data: Record<string, number>; error: string | null }> {
  const { data, error } = await supabase.rpc('get_session_balances_running', {
    p_client_id: clientId,
    p_from: fromISO,
  })
  if (error) return { data: {}, error: error.message }
  const result: Record<string, number> = {}
  for (const row of (data ?? []) as { enrollment_id: string; balance_after: number }[]) {
    result[row.enrollment_id] = row.balance_after
  }
  return { data: result, error: null }
}

/** Майбутні активні записи клієнта (enrolled/waitlist від початку дня). */
export async function listMyUpcomingEnrollments(
  supabase: Db,
  clientId: string,
  fromISO: string
): Promise<{ data: MyEnrollmentRow[]; error: string | null }> {
  const { data, error } = await myUpcomingEnrollmentsQuery(supabase, clientId, fromISO)
  // join-фільтр по classes.starts_at лишає рядки з classes=null (минулі) — відсіюємо.
  const rows = (data ?? []).filter(r => r.classes != null)
  return { data: rows, error: error?.message ?? null }
}

// Усі операції з sales: покупка абонемента (з тікетом) АБО депозитна операція
// (ticket_id=null: +amount_given поповнення / −price_paid списання). Snapshot-поля
// (інв. #5 — НЕ джойнити tickets). ticket_id/amount_given — щоб фронт визначив тип рядка.
const MY_PURCHASES_SELECT =
  'id, ticket_id, ticket_name, ticket_price, sessions, price_paid, amount_given, payment_method, ticket_type, created_at' as const

function myPurchasesQuery(supabase: Db, clientId: string) {
  return supabase
    .from('sales')
    .select(MY_PURCHASES_SELECT, { count: 'exact' })
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(100)
}

export type MyPurchaseRow = QueryData<ReturnType<typeof myPurchasesQuery>>[number]

/** Усі sales клієнта (покупки абонементів + депозитні операції), новіші зверху. */
export async function listMyPurchases(
  supabase: Db,
  clientId: string
): Promise<{ data: MyPurchaseRow[]; totalCount: number; error: string | null }> {
  const { data, count, error } = await myPurchasesQuery(supabase, clientId)
  return { data: data ?? [], totalCount: count ?? 0, error: error?.message ?? null }
}

// Архів записів: минулі заняття (starts_at < now) за статусами attended/noshow/cancelled/waitlist.
const MY_PAST_SELECT =
  'id, status, sessions_used, cancellation_source, classes!inner(ticket_type, title, starts_at, duration_min, trainers(name), halls(name))' as const

function myPastEnrollmentsQuery(supabase: Db, clientId: string) {
  return supabase
    .from('enrollments')
    .select(MY_PAST_SELECT, { count: 'exact' })
    .eq('client_id', clientId)
    .in('status', ['attended', 'noshow', 'cancelled', 'waitlist'])
    .lt('classes.starts_at', new Date().toISOString())
    .order('starts_at', { referencedTable: 'classes', ascending: false })
    .limit(50)
}

export type MyPastEnrollmentRow = QueryData<ReturnType<typeof myPastEnrollmentsQuery>>[number]

/** Архів записів клієнта (минулі заняття, усі завершені статуси), новіші зверху, останні 50. */
export async function listMyPastEnrollments(
  supabase: Db,
  clientId: string
): Promise<{ data: MyPastEnrollmentRow[]; totalCount: number; error: string | null }> {
  const { data, count, error } = await myPastEnrollmentsQuery(supabase, clientId)
  return { data: data ?? [], totalCount: count ?? 0, error: error?.message ?? null }
}

// Деталі одного запису (екран /client/visits/[id]). Усі поля заняття + тренер/зал.
const MY_ENROLLMENT_DETAIL_SELECT =
  'id, status, sessions_used, hours_attended, client_id, cancellation_source, classes!inner(id, ticket_type, title, starts_at, duration_min, is_cancelled, trainers(name), halls(name))' as const

function myEnrollmentDetailQuery(supabase: Db, clientId: string, enrollmentId: string) {
  return supabase
    .from('enrollments')
    .select(MY_ENROLLMENT_DETAIL_SELECT)
    .eq('id', enrollmentId)
    .eq('client_id', clientId) // подвійний гейт: RLS + явний фільтр (чужий запис недоступний)
}

export type MyEnrollmentDetailRow = QueryData<ReturnType<typeof myEnrollmentDetailQuery>>[number]

/** Деталі запису клієнта по id (з перевіркою власності). null = не знайдено/чужий. */
export async function getMyEnrollmentDetail(
  supabase: Db,
  clientId: string,
  enrollmentId: string
): Promise<{ data: MyEnrollmentDetailRow | null; error: string | null }> {
  const { data, error } = await myEnrollmentDetailQuery(supabase, clientId, enrollmentId).maybeSingle()
  return { data, error: error?.message ?? null }
}

// Розклад для самозапису клієнта (екран /client/schedule). Майбутні незаскасовані
// group-заняття у вікні [fromISO, toISO] (інші типи клієнту не показуємо — бізнес-вимога).
// RLS пускає client на читання classes/trainers/halls. Заповненість — окремим агрегатом
// class_availability (SECURITY DEFINER, бо enrollments під client_select_own).
// trainer_id — щоб кабінет групував заняття по тренерах за стабільним ключем (не по імені).
const BOOKABLE_CLASS_SELECT =
  'id, trainer_id, ticket_type, title, starts_at, duration_min, choreo_stage, trainers(name), halls(name)' as const

function bookableClassesQuery(supabase: Db, fromISO: string, toISO: string) {
  return supabase
    .from('classes')
    .select(BOOKABLE_CLASS_SELECT)
    .eq('is_cancelled', false)
    .eq('ticket_type', 'group')
    .gte('starts_at', fromISO)
    .lte('starts_at', toISO)
    .order('starts_at', { ascending: true })
}

export type BookableClassRow = QueryData<ReturnType<typeof bookableClassesQuery>>[number]

/** Майбутні group-заняття у вікні [fromISO, toISO] для самозапису клієнта (хронологічно). */
export async function listBookableClasses(
  supabase: Db,
  fromISO: string,
  toISO: string
): Promise<{ data: BookableClassRow[]; error: string | null }> {
  const { data, error } = await bookableClassesQuery(supabase, fromISO, toISO)
  return { data: data ?? [], error: error?.message ?? null }
}

export type ClassAvailability = {
  active_count: number
  waitlist_count: number
  capacity: number | null
}

/** Заповненість занять (active/waitlist/capacity) для тексту кнопки «у резерв».
 *  RPC class_availability — лише числа, без персональних даних (IDOR-безпечно). */
export async function getClassAvailability(
  supabase: Db,
  classIds: string[]
): Promise<{ data: Record<string, ClassAvailability>; error: string | null }> {
  if (classIds.length === 0) return { data: {}, error: null }
  const { data, error } = await supabase.rpc('class_availability', { p_class_ids: classIds })
  if (error) return { data: {}, error: error.message }
  const map: Record<string, ClassAvailability> = {}
  for (const r of data ?? []) {
    map[r.class_id] = {
      active_count: r.active_count,
      waitlist_count: r.waitlist_count,
      capacity: r.capacity,
    }
  }
  return { data: map, error: null }
}

/** Базова ціна за 1 заняття типу — тікет із sessions=1 (роздрібна). null якщо нема. */
export async function getBaseTicketPrice(
  supabase: Db,
  ticketType: string
): Promise<{ data: number | null; error: string | null }> {
  const { data, error } = await supabase
    .from('tickets')
    .select('price')
    .eq('ticket_type', ticketType)
    .eq('sessions', 1)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  return { data: data?.price ?? null, error: error?.message ?? null }
}
