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
    id: string; client_id: string; status: string; sessions_used: number; hours_attended: number[] | null; created_at: string; cancellation_source: string | null;
    clients: { first_name: string | null; last_name: string | null } | null
  }[];
  error: string | null
}> {
  type EnrollmentForClass = {
    id: string; client_id: string; status: string; sessions_used: number; hours_attended: number[] | null; created_at: string; cancellation_source: string | null;
    clients: { first_name: string | null; last_name: string | null } | null
  }

  const { data, error } = await supabase
    .from('enrollments')
    .select('id, client_id, status, sessions_used, hours_attended, created_at, cancellation_source, clients(first_name, last_name)')
    .eq('class_id', classId)
    .order('created_at')
    .returns<EnrollmentForClass[]>()

  return { data: data ?? [], error: error?.message ?? null }
}

/** Залишок сесій після заняття atISO для кожного клієнта (батч). */
export async function getSessionBalancesAfter(
  supabase: Db,
  clientIds: string[],
  ticketType: string,
  atISO: string,
): Promise<{ data: Record<string, number>; error: string | null }> {
  if (clientIds.length === 0) return { data: {}, error: null }
  const { data, error } = await supabase.rpc('get_session_balance_after', {
    p_client_ids: clientIds,
    p_ticket_type: ticketType,
    p_at: atISO,
  })
  if (error) return { data: {}, error: error.message }
  const result: Record<string, number> = {}
  for (const row of (data ?? []) as { client_id: string; balance_after: number }[]) {
    result[row.client_id] = row.balance_after
  }
  return { data: result, error: null }
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

/**
 * Фізично видалити помилковий запис (реверс сесій у БД).
 * Свідомий виняток з «м'яких видалень» (інв. #7): «випадкового» запису не повинно
 * існувати взагалі. Тільки через RPC — гейт can_manage_enrollment() + реверс сесій
 * у тій самій транзакції. Прямий DELETE enrollments з UI заборонено.
 */
export async function deleteEnrollment(
  supabase: Db,
  enrollmentId: string
): Promise<{ success: boolean; error: string | null }> {
  const { success, error } = await callRpc<{ success: boolean; error_message: string | null }>(
    () => supabase.rpc('delete_enrollment', { p_enrollment_id: enrollmentId })
  )
  return { success, error }
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
): Promise<{ error: string | null; isDuplicate: boolean; closeError?: string | null }> {
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

  // Заняття вже почалось і тригер не перевів у waitlist → закриваємо одразу в attended.
  // ⚠️ Саме change_enrollment_status, НЕ mark_attendance: остання має EXECUTE лише для
  // postgres (cron), з браузера (роль authenticated) PostgREST її відхиляє — і запис лишався
  // enrolled до тику cron (≤60с). change_enrollment_status доступна authenticated, проходить
  // гейт can_manage_enrollment для owner/admin і так само вирівнює client_session_balances.
  // sessions_used = к-сть годин для довгих занять, інакше 1.
  const startsAt = cls?.starts_at ? new Date(cls.starts_at) : null
  if (inserted?.status === 'enrolled' && startsAt && startsAt <= new Date()) {
    const sessionsUsed = hoursAttended?.length ?? 1
    const { error: closeError } = await changeEnrollmentStatus(supabase, inserted.id, 'attended', { sessionsUsed })
    // Не валимо запис, якщо закриття не вдалось — cron підхопить як страховку. Лише сигналимо.
    if (closeError) return { error: null, isDuplicate: false, closeError }
  }

  return { error: null, isDuplicate: false, closeError: null }
}
