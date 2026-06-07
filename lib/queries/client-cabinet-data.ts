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
    .select(MY_PURCHASES_SELECT)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(100)
}

export type MyPurchaseRow = QueryData<ReturnType<typeof myPurchasesQuery>>[number]

/** Усі sales клієнта (покупки абонементів + депозитні операції), новіші зверху. */
export async function listMyPurchases(
  supabase: Db,
  clientId: string
): Promise<{ data: MyPurchaseRow[]; error: string | null }> {
  const { data, error } = await myPurchasesQuery(supabase, clientId)
  return { data: data ?? [], error: error?.message ?? null }
}

// Архів записів: минулі заняття за статусами attended/noshow/cancelled.
const MY_PAST_SELECT =
  'id, status, sessions_used, classes!inner(ticket_type, title, starts_at, duration_min, trainers(name), halls(name))' as const

function myPastEnrollmentsQuery(supabase: Db, clientId: string) {
  return supabase
    .from('enrollments')
    .select(MY_PAST_SELECT)
    .eq('client_id', clientId)
    .in('status', ['attended', 'noshow', 'cancelled'])
    .order('starts_at', { referencedTable: 'classes', ascending: false })
    .limit(50)
}

export type MyPastEnrollmentRow = QueryData<ReturnType<typeof myPastEnrollmentsQuery>>[number]

/** Архів записів клієнта (минулі заняття, усі завершені статуси), новіші зверху, останні 50. */
export async function listMyPastEnrollments(
  supabase: Db,
  clientId: string
): Promise<{ data: MyPastEnrollmentRow[]; error: string | null }> {
  const { data, error } = await myPastEnrollmentsQuery(supabase, clientId)
  return { data: data ?? [], error: error?.message ?? null }
}

// Деталі одного запису (екран /client/visits/[id]). Усі поля заняття + тренер/зал.
const MY_ENROLLMENT_DETAIL_SELECT =
  'id, status, sessions_used, hours_attended, client_id, classes!inner(id, ticket_type, title, starts_at, duration_min, is_cancelled, trainers(name), halls(name))' as const

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

/**
 * Розраховує залишок сесій клієнта після конкретного заняття (atISO) — однакова
 * логіка для минулих, майбутніх і постфактум записів.
 *
 * Алгоритм:
 * 1. Беремо всі записи клієнта цього типу (будь-який статус крім cancelled без списання).
 * 2. Визначаємо «вартість» кожного: sessions_used якщо вже списано, інакше hours_attended.length ?? 1.
 * 3. initialBalance = rawBalance + sum(вартість усіх записів) — відновлюємо баланс до нуля занять.
 * 4. Повертаємо initialBalance − sum(вартість записів зі starts_at <= atISO).
 */
export async function calcSessionBalanceAfter(
  supabase: Db,
  clientId: string,
  ticketType: string,
  rawBalance: number,
  atISO: string,
): Promise<{ data: number; error: string | null }> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('sessions_used, hours_attended, status, classes!inner(ticket_type, starts_at)')
    .eq('client_id', clientId)
    .eq('classes.ticket_type', ticketType)
    .in('status', ['enrolled', 'attended', 'noshow', 'waitlist'])
  if (error) return { data: rawBalance, error: error.message }

  type Row = { sessions_used: number; hours_attended: number[] | null; status: string; classes: { starts_at: string } }
  const rows = (data ?? []) as Row[]

  const cost = (r: Row) => r.sessions_used > 0 ? r.sessions_used : (r.hours_attended && r.hours_attended.length > 0 ? r.hours_attended.length : 1)

  // Відновлюємо початковий баланс (до будь-яких списань)
  const initialBalance = rawBalance + rows.reduce((sum, r) => sum + cost(r), 0)

  // Віднімаємо вартість усіх записів що починаються до atISO включно
  const parseMs = (s: string) => new Date(s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).getTime()
  const atMs = parseMs(atISO)
  const usedUpTo = rows
    .filter(r => parseMs(r.classes.starts_at) <= atMs)
    .reduce((sum, r) => sum + cost(r), 0)

  return { data: initialBalance - usedUpTo, error: null }
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
