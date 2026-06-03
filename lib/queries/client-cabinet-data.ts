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
