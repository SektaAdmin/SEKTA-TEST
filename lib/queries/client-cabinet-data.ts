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

/** Залишки занять по типах (усі куплені типи крім striprental, сортування по sort_order). */
export async function listMySessionBalances(
  supabase: Db,
  clientId: string
): Promise<{ data: { ticket_type: string; sessions_balance: number }[]; error: string | null }> {
  const { data, error } = await supabase
    .from('client_session_balances')
    .select('ticket_type, sessions_balance, training_types(sort_order)')
    .eq('client_id', clientId)
    .neq('ticket_type', 'striprental')
    .order('sort_order', { referencedTable: 'training_types', ascending: true })
  const rows = (data ?? []).map(r => ({
    ticket_type: r.ticket_type,
    sessions_balance: r.sessions_balance,
  }))
  return { data: rows, error: error?.message ?? null }
}

const MY_ENROLLMENTS_SELECT =
  'id, status, class_id, classes(id, ticket_type, title, starts_at, duration_min, is_cancelled, trainers(name), halls(name))' as const

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

function myPastEnrollmentsQuery(supabase: Db, clientId: string, beforeISO: string) {
  return supabase
    .from('enrollments')
    .select(MY_PAST_SELECT)
    .eq('client_id', clientId)
    .in('status', ['attended', 'noshow', 'cancelled'])
    .lt('classes.starts_at', beforeISO)
    .order('starts_at', { referencedTable: 'classes', ascending: false })
    .limit(100)
}

export type MyPastEnrollmentRow = QueryData<ReturnType<typeof myPastEnrollmentsQuery>>[number]

/** Архів записів клієнта (минулі заняття, усі завершені статуси), новіші зверху, останні 100. */
export async function listMyPastEnrollments(
  supabase: Db,
  clientId: string,
  beforeISO: string
): Promise<{ data: MyPastEnrollmentRow[]; error: string | null }> {
  const { data, error } = await myPastEnrollmentsQuery(supabase, clientId, beforeISO)
  return { data: data ?? [], error: error?.message ?? null }
}
