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

/** Залишки занять по типах (лише ненульові). */
export async function listMySessionBalances(
  supabase: Db,
  clientId: string
): Promise<{ data: { ticket_type: string; sessions_balance: number }[]; error: string | null }> {
  const { data, error } = await supabase
    .from('client_session_balances')
    .select('ticket_type, sessions_balance')
    .eq('client_id', clientId)
    .neq('sessions_balance', 0)
  return { data: data ?? [], error: error?.message ?? null }
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

// Покупки абонементів: лише snapshot-поля (інв. #5 — НЕ джойнити tickets).
const MY_PURCHASES_SELECT =
  'id, ticket_name, ticket_price, sessions, price_paid, payment_method, ticket_type, created_at' as const

function myPurchasesQuery(supabase: Db, clientId: string) {
  return supabase
    .from('sales')
    .select(MY_PURCHASES_SELECT)
    .eq('client_id', clientId)
    .not('ticket_id', 'is', null)
    .order('created_at', { ascending: false })
}

export type MyPurchaseRow = QueryData<ReturnType<typeof myPurchasesQuery>>[number]

/** Покупки абонементів клієнта (sales з тікетом), новіші зверху. */
export async function listMyPurchases(
  supabase: Db,
  clientId: string
): Promise<{ data: MyPurchaseRow[]; error: string | null }> {
  const { data, error } = await myPurchasesQuery(supabase, clientId)
  return { data: data ?? [], error: error?.message ?? null }
}

const MY_BALANCE_TX_SELECT = 'id, amount, transaction_type, description, created_at' as const

function myBalanceTxQuery(supabase: Db, clientId: string) {
  return supabase
    .from('balance_transactions')
    .select(MY_BALANCE_TX_SELECT)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50)
}

export type MyBalanceTxRow = QueryData<ReturnType<typeof myBalanceTxQuery>>[number]

/** Рух депозиту клієнта (balance_transactions), новіші зверху, останні 50. */
export async function listMyBalanceTransactions(
  supabase: Db,
  clientId: string
): Promise<{ data: MyBalanceTxRow[]; error: string | null }> {
  const { data, error } = await myBalanceTxQuery(supabase, clientId)
  return { data: data ?? [], error: error?.message ?? null }
}
