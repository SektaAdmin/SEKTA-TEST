import type { SupabaseClient } from '@supabase/supabase-js'

export async function listClassesForDate(
  supabase: SupabaseClient,
  date: string
): Promise<{
  id: string; ticket_type: string; title: string | null; starts_at: string;
  duration_min: number; capacity: number | null; is_cancelled: boolean;
  trainers: { name: string } | null; halls: { name: string } | null
}[]> {
  const dayStart = new Date(`${date}T00:00:00`).toISOString()
  const dayEnd = new Date(`${date}T23:59:59.999`).toISOString()
  const { data } = await supabase
    .from('classes')
    .select('id, ticket_type, title, starts_at, duration_min, capacity, is_cancelled, trainers(name), halls(name)')
    .gte('starts_at', dayStart)
    .lte('starts_at', dayEnd)
    .eq('is_cancelled', false)
    .order('starts_at', { ascending: true })
  return (data ?? []) as any[]
}

export async function listEnrolledCountsForDate(
  supabase: SupabaseClient,
  classIds: string[]
): Promise<Record<string, number>> {
  if (classIds.length === 0) return {}
  const { data } = await supabase
    .from('enrollments')
    .select('class_id, status')
    .in('class_id', classIds)
    .in('status', ['enrolled', 'attended'])
  const map: Record<string, number> = {}
  for (const e of (data ?? []) as { class_id: string | null }[]) {
    if (!e.class_id) continue
    map[e.class_id] = (map[e.class_id] ?? 0) + 1
  }
  return map
}

export async function listClientEnrolledClassIds(
  supabase: SupabaseClient,
  clientId: string,
  classIds: string[]
): Promise<Set<string>> {
  if (classIds.length === 0) return new Set()
  const { data } = await supabase
    .from('enrollments')
    .select('class_id')
    .eq('client_id', clientId)
    .in('class_id', classIds)
    .in('status', ['enrolled', 'attended'])
  return new Set(
    (data ?? [])
      .map((e: { class_id: string | null }) => e.class_id)
      .filter((id: string | null): id is string => id != null)
  )
}

export async function listEnrollmentsForClass(
  supabase: SupabaseClient,
  classId: string
): Promise<{
  id: string; client_id: string; status: string; sessions_used: number; hours_attended: number[] | null; created_at: string;
  clients: { first_name: string | null; last_name: string | null } | null
}[]> {
  const { data } = await supabase
    .from('enrollments')
    .select('id, client_id, status, sessions_used, hours_attended, created_at, clients(first_name, last_name)')
    .eq('class_id', classId)
    .order('created_at')
  return (data as any[]) ?? []
}

export async function listSessionBalancesForClients(
  supabase: SupabaseClient,
  clientIds: string[],
  ticketType: string
): Promise<Record<string, number>> {
  if (clientIds.length === 0) return {}
  const { data } = await supabase
    .from('client_session_balances')
    .select('client_id, sessions_balance')
    .in('client_id', clientIds)
    .eq('ticket_type', ticketType)
  const map: Record<string, number> = {}
  for (const b of (data ?? []) as { client_id: string; sessions_balance: number }[]) {
    map[b.client_id] = b.sessions_balance
  }
  return map
}

export async function getClientSessionBalance(
  supabase: SupabaseClient,
  clientId: string,
  ticketType: string
): Promise<number> {
  const { data } = await supabase
    .from('client_session_balances')
    .select('sessions_balance')
    .eq('client_id', clientId)
    .eq('ticket_type', ticketType)
    .single()
  return data?.sessions_balance ?? 0
}

export async function markAttendance(
  supabase: SupabaseClient,
  enrollmentId: string,
  sessionsUsed = 1
): Promise<{ success: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('mark_attendance', {
    p_enrollment_id: enrollmentId,
    p_sessions_used: sessionsUsed,
  })
  if (error || data?.[0]?.success === false) {
    return { success: false, error: data?.[0]?.error_message ?? error?.message ?? 'Помилка' }
  }
  return { success: true, error: null }
}

export async function reverseAttendance(
  supabase: SupabaseClient,
  enrollmentId: string
): Promise<{ success: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('reverse_attendance', { p_enrollment_id: enrollmentId })
  if (error || data?.[0]?.success === false) {
    return { success: false, error: data?.[0]?.error_message ?? error?.message ?? 'Помилка' }
  }
  return { success: true, error: null }
}

export async function updateEnrollmentStatus(
  supabase: SupabaseClient,
  enrollmentId: string,
  status: 'noshow' | 'cancelled'
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('enrollments').update({ status }).eq('id', enrollmentId)
  return { error: error?.message ?? null }
}

export async function checkClientConflict(
  supabase: SupabaseClient,
  clientId: string,
  classId: string
): Promise<{ starts_at: string; ticket_type: string } | null> {
  const { data } = await supabase.rpc('check_client_conflict', {
    p_client_id: clientId,
    p_class_id: classId,
  })
  return data?.[0] ?? null
}

export async function enrollClient(
  supabase: SupabaseClient,
  classId: string,
  clientId: string,
  hoursAttended?: number[]
): Promise<{ error: string | null; isDuplicate: boolean }> {
  const { error } = await supabase
    .from('enrollments')
    .insert({
      class_id: classId,
      client_id: clientId,
      status: 'enrolled',
      ...(hoursAttended !== undefined ? { hours_attended: hoursAttended } : {}),
    })
  if (!error) return { error: null, isDuplicate: false }
  const isDuplicate = error.message.includes('duplicate') || error.code === '23505'
  return { error: error.message, isDuplicate }
}
