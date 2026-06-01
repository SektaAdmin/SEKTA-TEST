import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client, ClientSessionBalance, Sale } from '@/types'

export type PermanentEnrollment = {
  id: string
  series_id: string
  class_series: {
    title: string | null
    ticket_type: string
    day_of_week: number
    time_of_day: string
    duration_min: number
    trainers: { name: string } | null
    halls: { name: string } | null
  } | null
}

export type UpcomingEnrollment = {
  id: string
  class_id: string
  status: string
  classes: {
    ticket_type: string
    title: string | null
    starts_at: string
    duration_min: number
    trainers: { name: string } | null
    halls: { name: string } | null
  } | null
}

export type PastEnrollment = {
  id: string
  class_id: string
  status: string
  sessions_used: number
  classes: {
    ticket_type: string
    title: string | null
    starts_at: string
    duration_min: number
    trainers: { name: string } | null
    halls: { name: string } | null
  } | null
}

export type FeedEnrollment = {
  id: string
  class_id: string
  status: string
  sessions_used: number
  classes: {
    ticket_type: string
    title: string | null
    starts_at: string
    duration_min: number
    trainers: { name: string } | null
    halls: { name: string } | null
  } | null
}

export async function getClientDetail(
  supabase: SupabaseClient,
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
      .from('clients')
      .select('id, first_name, last_name, phone, instagram_username, telegram_username, balance, credit_limit, balance_updated_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('client_session_balances')
      .select('client_id, ticket_type, sessions_balance')
      .eq('client_id', id)
      .neq('sessions_balance', 0)
      .order('ticket_type'),
    supabase
      .from('series_clients')
      .select('id, series_id, class_series(title, ticket_type, day_of_week, time_of_day, duration_min, trainers(name), halls(name))')
      .eq('client_id', id)
      .order('day_of_week', { referencedTable: 'class_series', ascending: true })
      .order('time_of_day', { referencedTable: 'class_series', ascending: true }),
    supabase
      .from('enrollments')
      .select('id, class_id, status, classes!inner(ticket_type, title, starts_at, duration_min, trainers(name), halls(name))')
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
    permanentEnrollments: (permanentRes.data as unknown as PermanentEnrollment[]) ?? [],
    upcomingEnrollments: (upcomingRes.data as unknown as UpcomingEnrollment[]) ?? [],
    error,
  }
}

export async function listPastEnrollmentsForClient(
  supabase: SupabaseClient,
  clientId: string,
  page: number,
  pageSize: number
): Promise<{ data: PastEnrollment[]; count: number; error: string | null }> {
  const from = page * pageSize
  const to = from + pageSize - 1

  const { data, count, error } = await supabase
    .from('enrollments')
    .select('id, class_id, status, sessions_used, classes!inner(ticket_type, title, starts_at, duration_min, trainers(name), halls(name))', { count: 'exact' })
    .eq('client_id', clientId)
    .in('status', ['attended', 'noshow', 'cancelled'])
    .order('starts_at', { referencedTable: 'classes', ascending: false })
    .range(from, to)

  return {
    data: (data as unknown as PastEnrollment[]) ?? [],
    count: count ?? 0,
    error: error?.message ?? null,
  }
}

export async function listFeedEnrollmentsForClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ data: FeedEnrollment[]; error: string | null }> {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('enrollments')
    .select('id, class_id, status, sessions_used, classes!inner(ticket_type, title, starts_at, duration_min, trainers(name), halls(name))')
    .eq('client_id', clientId)
    .in('status', ['attended', 'noshow', 'cancelled'])
    .lt('classes.starts_at', now)
    .order('starts_at', { referencedTable: 'classes', ascending: false })

  return { data: (data as unknown as FeedEnrollment[]) ?? [], error: error?.message ?? null }
}
