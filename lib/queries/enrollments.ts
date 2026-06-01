import type { SupabaseClient } from '@supabase/supabase-js'

export async function listClassesForDate(
  supabase: SupabaseClient,
  date: string
): Promise<{
  data: {
    id: string; ticket_type: string; title: string | null; starts_at: string;
    duration_min: number; capacity: number | null; is_cancelled: boolean;
    trainers: { name: string } | null; halls: { name: string } | null
  }[];
  error: string | null
}> {
  const dayStart = new Date(`${date}T00:00:00`).toISOString()
  const dayEnd = new Date(`${date}T23:59:59.999`).toISOString()
  const { data, error } = await supabase
    .from('classes')
    .select('id, ticket_type, title, starts_at, duration_min, capacity, is_cancelled, trainers(name), halls(name)')
    .gte('starts_at', dayStart)
    .lte('starts_at', dayEnd)
    .eq('is_cancelled', false)
    .order('starts_at', { ascending: true })
  return { data: (data ?? []) as any[], error: error?.message ?? null }
}

export async function listEnrolledCountsForDate(
  supabase: SupabaseClient,
  classIds: string[]
): Promise<{ data: Record<string, number>; error: string | null }> {
  if (classIds.length === 0) return { data: {}, error: null }
  const { data, error } = await supabase
    .from('enrollments')
    .select('class_id, status')
    .in('class_id', classIds)
    .in('status', ['enrolled', 'attended'])
  const map: Record<string, number> = {}
  for (const e of (data ?? []) as { class_id: string | null }[]) {
    if (!e.class_id) continue
    map[e.class_id] = (map[e.class_id] ?? 0) + 1
  }
  return { data: map, error: error?.message ?? null }
}

export async function listClientEnrolledClassIds(
  supabase: SupabaseClient,
  clientId: string,
  classIds: string[]
): Promise<{ data: Set<string>; error: string | null }> {
  if (classIds.length === 0) return { data: new Set(), error: null }
  const { data, error } = await supabase
    .from('enrollments')
    .select('class_id')
    .eq('client_id', clientId)
    .in('class_id', classIds)
    .in('status', ['enrolled', 'attended'])
  return {
    data: new Set(
      (data ?? [])
        .map((e: { class_id: string | null }) => e.class_id)
        .filter((id: string | null): id is string => id != null)
    ),
    error: error?.message ?? null,
  }
}

export async function listEnrollmentsForClass(
  supabase: SupabaseClient,
  classId: string
): Promise<{
  data: {
    id: string; client_id: string; status: string; sessions_used: number; hours_attended: number[] | null; created_at: string;
    clients: { first_name: string | null; last_name: string | null } | null
  }[];
  error: string | null
}> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('id, client_id, status, sessions_used, hours_attended, created_at, clients(first_name, last_name)')
    .eq('class_id', classId)
    .order('created_at')
  return { data: (data as any[]) ?? [], error: error?.message ?? null }
}

export async function listSessionBalancesForClients(
  supabase: SupabaseClient,
  clientIds: string[],
  ticketType: string
): Promise<{ data: Record<string, number>; error: string | null }> {
  if (clientIds.length === 0) return { data: {}, error: null }
  const { data, error } = await supabase
    .from('client_session_balances')
    .select('client_id, sessions_balance')
    .in('client_id', clientIds)
    .eq('ticket_type', ticketType)
  const map: Record<string, number> = {}
  for (const b of (data ?? []) as { client_id: string; sessions_balance: number }[]) {
    map[b.client_id] = b.sessions_balance
  }
  return { data: map, error: error?.message ?? null }
}

export async function getClientSessionBalance(
  supabase: SupabaseClient,
  clientId: string,
  ticketType: string
): Promise<{ data: number; error: string | null }> {
  const { data, error } = await supabase
    .from('client_session_balances')
    .select('sessions_balance')
    .eq('client_id', clientId)
    .eq('ticket_type', ticketType)
    .maybeSingle()
  return { data: data?.sessions_balance ?? 0, error: error?.message ?? null }
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

export type EnrollmentStatus = 'enrolled' | 'attended' | 'noshow' | 'cancelled' | 'waitlist'

/**
 * Єдина точка зміни статусу enrollment. Обходити прямим UPDATE НЕ МОЖНА —
 * RPC тримає інваріант client_session_balances і застосовує правило
 * скасування у часових рамках (див. міграцію 20260603).
 *
 * @returns charged — чи списано сесію (для toast адміну).
 */
export async function changeEnrollmentStatus(
  supabase: SupabaseClient,
  enrollmentId: string,
  status: EnrollmentStatus,
  opts?: { forceNoCharge?: boolean; sessionsUsed?: number }
): Promise<{ success: boolean; charged: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('change_enrollment_status', {
    p_enrollment_id: enrollmentId,
    p_new_status: status,
    p_force_no_charge: opts?.forceNoCharge ?? false,
    p_sessions_used: opts?.sessionsUsed ?? null,
  })
  const row = data?.[0]
  if (error || row?.success === false) {
    return { success: false, charged: false, error: row?.error_message ?? error?.message ?? 'Помилка' }
  }
  return { success: true, charged: row?.charged ?? false, error: null }
}

export async function checkClientConflict(
  supabase: SupabaseClient,
  clientId: string,
  classId: string
): Promise<{ data: { starts_at: string; ticket_type: string } | null; error: string | null }> {
  const { data, error } = await supabase.rpc('check_client_conflict', {
    p_client_id: clientId,
    p_class_id: classId,
  })
  return { data: data?.[0] ?? null, error: error?.message ?? null }
}

/**
 * Записати клієнта на заняття. Оренда (hallrental тощо) — звичайний запис, як
 * group/individual: списується СЕСІЯ при відвідуванні, депозит не чіпається.
 * (Раніше тут була гілка авто-create_sale зі списанням депозиту для rental-
 * типів — це була хибна логіка через плутанину в слові «оренда»; видалено.)
 */
export async function enrollClient(
  supabase: SupabaseClient,
  classId: string,
  clientId: string,
  hoursAttended?: number[]
): Promise<{ error: string | null; isDuplicate: boolean }> {
  const { error: insertError } = await supabase
    .from('enrollments')
    .insert({
      class_id: classId,
      client_id: clientId,
      status: 'enrolled',
      ...(hoursAttended !== undefined ? { hours_attended: hoursAttended } : {}),
    })
  if (insertError) {
    const isDuplicate = insertError.message.includes('duplicate') || insertError.code === '23505'
    return { error: insertError.message, isDuplicate }
  }

  return { error: null, isDuplicate: false }
}
