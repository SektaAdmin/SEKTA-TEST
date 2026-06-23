import type { QueryData } from '@supabase/supabase-js'
import type { Db } from '@/lib/queries/_db'
import type { Client, ClientSessionBalance } from '@/types'

// Усі embed тут single-FK (class_series/classes/trainers/halls) → select-літерали
// напряму, типи виведено через QueryData (джерело істини = .select()).
const PERMANENT_SELECT = 'id, series_id, class_series(title, ticket_type, day_of_week, time_of_day, duration_min, trainers(name), halls(name))' as const
const UPCOMING_SELECT = 'id, class_id, status, classes!inner(ticket_type, title, starts_at, duration_min, choreo_stage, trainers(name), halls(name))' as const
const PAST_SELECT = 'id, class_id, status, sessions_used, classes!inner(ticket_type, title, starts_at, duration_min, choreo_stage, trainers(name), halls(name))' as const

function permanentQuery(supabase: Db) { return supabase.from('series_clients').select(PERMANENT_SELECT) }
function upcomingQuery(supabase: Db) { return supabase.from('enrollments').select(UPCOMING_SELECT) }
function pastQuery(supabase: Db) { return supabase.from('enrollments').select(PAST_SELECT) }

export type PermanentEnrollment = QueryData<ReturnType<typeof permanentQuery>>[number]
export type UpcomingEnrollment = QueryData<ReturnType<typeof upcomingQuery>>[number]
export type PastEnrollment = QueryData<ReturnType<typeof pastQuery>>[number]
export type FeedEnrollment = PastEnrollment

export async function getClientDetail(
  supabase: Db,
  id: string
): Promise<{
  client: Client | null
  sessionBalances: ClientSessionBalance[]
  permanentEnrollments: PermanentEnrollment[]
  upcomingEnrollments: UpcomingEnrollment[]
  error: string | null
}> {
  const now = new Date().toISOString()

  const [clientRes, balancesRes, permanentRes, upcomingRes] = await Promise.all([
    supabase
      .from('clients_with_contacts')
      .select('id, first_name, last_name, phone, instagram_username, telegram_username, balance, credit_limit, balance_updated_at, user_id')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('client_session_balances')
      .select('client_id, ticket_type, sessions_balance')
      .eq('client_id', id)
      .neq('sessions_balance', 0)
      .order('ticket_type'),
    permanentQuery(supabase)
      .eq('client_id', id)
      .order('day_of_week', { referencedTable: 'class_series', ascending: true })
      .order('time_of_day', { referencedTable: 'class_series', ascending: true }),
    upcomingQuery(supabase)
      .eq('client_id', id)
      .eq('status', 'enrolled')
      .gt('classes.starts_at', now)
      .order('starts_at', { referencedTable: 'classes', ascending: true }),
  ])

  const error =
    clientRes.error?.message ??
    balancesRes.error?.message ??
    permanentRes.error?.message ??
    upcomingRes.error?.message ??
    null

  return {
    client: (clientRes.data as Client) ?? null,
    sessionBalances: (balancesRes.data as ClientSessionBalance[]) ?? [],
    permanentEnrollments: permanentRes.data ?? [],
    upcomingEnrollments: upcomingRes.data ?? [],
    error,
  }
}

export async function listFeedEnrollmentsForClient(
  supabase: Db,
  clientId: string
): Promise<{ data: FeedEnrollment[]; error: string | null }> {
  const now = new Date().toISOString()

  const { data, error } = await pastQuery(supabase)
    .eq('client_id', clientId)
    .in('status', ['attended', 'noshow', 'cancelled'])
    .lt('classes.starts_at', now)
    .order('starts_at', { referencedTable: 'classes', ascending: false })

  return { data: data ?? [], error: error?.message ?? null }
}
