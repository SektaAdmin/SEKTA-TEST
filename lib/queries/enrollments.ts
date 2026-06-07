import type { Db } from '@/lib/queries/_db'
import { callRpc } from '@/lib/rpc'

export async function listClassesForDate(
  supabase: Db,
  date: string
): Promise<{
  data: {
    id: string; ticket_type: string; title: string | null; starts_at: string;
    duration_min: number; capacity: number | null; is_cancelled: boolean;
    choreo_stage: string | null;
    trainers: { name: string } | null; halls: { name: string } | null
  }[];
  error: string | null
}> {
  const dayStart = new Date(`${date}T00:00:00`).toISOString()
  const dayEnd = new Date(`${date}T23:59:59.999`).toISOString()

  type ClassForDate = {
    id: string; ticket_type: string; title: string | null; starts_at: string;
    duration_min: number; capacity: number | null; is_cancelled: boolean;
    choreo_stage: string | null;
    trainers: { name: string } | null; halls: { name: string } | null
  }

  const { data, error } = await supabase
    .from('classes')
    .select('id, ticket_type, title, starts_at, duration_min, capacity, is_cancelled, choreo_stage, trainers(name), halls(name)')
    .gte('starts_at', dayStart)
    .lte('starts_at', dayEnd)
    .eq('is_cancelled', false)
    .order('starts_at', { ascending: true })
    .returns<ClassForDate[]>()

  return { data: data ?? [], error: error?.message ?? null }
}

export async function listEnrolledCountsForDate(
  supabase: Db,
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
  supabase: Db,
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
  supabase: Db,
  classId: string
): Promise<{
  data: {
    id: string; client_id: string; status: string; sessions_used: number; hours_attended: number[] | null; created_at: string;
    clients: { first_name: string | null; last_name: string | null } | null
  }[];
  error: string | null
}> {
  type EnrollmentForClass = {
    id: string; client_id: string; status: string; sessions_used: number; hours_attended: number[] | null; created_at: string;
    clients: { first_name: string | null; last_name: string | null } | null
  }

  const { data, error } = await supabase
    .from('enrollments')
    .select('id, client_id, status, sessions_used, hours_attended, created_at, clients(first_name, last_name)')
    .eq('class_id', classId)
    .order('created_at')
    .returns<EnrollmentForClass[]>()

  return { data: data ?? [], error: error?.message ?? null }
}

export async function listSessionBalancesForClients(
  supabase: Db,
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

/**
 * Батч-версія для адмінки: для кожного клієнта з clientIds рахує залишок сесій
 * після заняття atISO — та сама логіка що й calcSessionBalanceAfter, але одним
 * запитом на всіх клієнтів.
 */
export async function listSessionBalancesAfterClass(
  supabase: Db,
  clientIds: string[],
  ticketType: string,
  rawBalanceMap: Record<string, number>,
  atISO: string,
): Promise<{ data: Record<string, number>; error: string | null }> {
  if (clientIds.length === 0) return { data: {}, error: null }
  const { data, error } = await supabase
    .from('enrollments')
    .select('client_id, sessions_used, hours_attended, status, classes!inner(ticket_type, starts_at)')
    .in('client_id', clientIds)
    .eq('classes.ticket_type', ticketType)
    .in('status', ['enrolled', 'attended', 'noshow', 'waitlist'])
  if (error) return { data: rawBalanceMap, error: error.message }

  type Row = { client_id: string; sessions_used: number; hours_attended: number[] | null; status: string; classes: { starts_at: string } }
  const rows = (data ?? []) as Row[]

  const cost = (r: Row) => r.sessions_used > 0 ? r.sessions_used : (r.hours_attended && r.hours_attended.length > 0 ? r.hours_attended.length : 1)

  const result: Record<string, number> = {}
  for (const clientId of clientIds) {
    const clientRows = rows.filter(r => r.client_id === clientId)
    const raw = rawBalanceMap[clientId] ?? 0
    const initialBalance = raw + clientRows.reduce((sum, r) => sum + cost(r), 0)
    const usedUpTo = clientRows.filter(r => r.classes.starts_at <= atISO).reduce((sum, r) => sum + cost(r), 0)
    result[clientId] = initialBalance - usedUpTo
  }
  return { data: result, error: null }
}

export async function getClientSessionBalance(
  supabase: Db,
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

// Вживає лише enrollClient нижче (запис у вже-минуле заняття). UI → changeEnrollmentStatus.
async function markAttendance(
  supabase: Db,
  enrollmentId: string,
  sessionsUsed = 1
): Promise<{ success: boolean; error: string | null }> {
  const { success, error } = await callRpc(() =>
    supabase.rpc('mark_attendance', {
      p_enrollment_id: enrollmentId,
      p_sessions_used: sessionsUsed,
    })
  )
  return { success, error }
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
  supabase: Db,
  enrollmentId: string,
  status: EnrollmentStatus,
  opts?: { forceNoCharge?: boolean; sessionsUsed?: number }
): Promise<{ success: boolean; charged: boolean; error: string | null }> {
  const { row, success, error } = await callRpc<{ success: boolean; error_message: string | null; charged: boolean }>(
    () => supabase.rpc('change_enrollment_status', {
      p_enrollment_id: enrollmentId,
      p_new_status: status,
      p_force_no_charge: opts?.forceNoCharge ?? false,
      p_sessions_used: opts?.sessionsUsed ?? undefined,
    })
  )
  if (!success) return { success: false, charged: false, error }
  return { success: true, charged: row?.charged ?? false, error: null }
}

export async function checkClientConflict(
  supabase: Db,
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
  supabase: Db,
  classId: string,
  clientId: string,
  hoursAttended?: number[]
): Promise<{ error: string | null; isDuplicate: boolean }> {
  // Тягнемо starts_at, щоб запис постфактум (заняття вже почалось) одразу закрити
  // в attended, а не чекати тик cron. Модель «почалось = проведено».
  const { data: cls } = await supabase
    .from('classes')
    .select('starts_at')
    .eq('id', classId)
    .maybeSingle()

  const { data: inserted, error: insertError } = await supabase
    .from('enrollments')
    .insert({
      class_id: classId,
      client_id: clientId,
      status: 'enrolled',
      ...(hoursAttended !== undefined ? { hours_attended: hoursAttended } : {}),
    })
    .select('id, status')
    .single()
  if (insertError) {
    const isDuplicate = insertError.message.includes('duplicate') || insertError.code === '23505'
    return { error: insertError.message, isDuplicate }
  }

  // Заняття вже почалось і тригер не перевів у waitlist → списуємо одразу через RPC.
  // (sessions_used = к-сть годин для довгих занять, інакше 1 — як у mark_attendance.)
  const startsAt = cls?.starts_at ? new Date(cls.starts_at) : null
  if (inserted?.status === 'enrolled' && startsAt && startsAt <= new Date()) {
    const sessionsUsed = hoursAttended?.length ?? 1
    await markAttendance(supabase, inserted.id, sessionsUsed)
  }

  return { error: null, isDuplicate: false }
}
