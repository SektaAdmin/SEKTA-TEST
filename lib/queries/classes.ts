import type { SupabaseClient } from '@supabase/supabase-js'
import type { Class, ClassSeries } from '@/types'

export type ClassWithJoins = Class & {
  trainers: { name: string } | null
  halls: { name: string } | null
  enrollments: { id: string; status: string }[]
}

export async function listClassesForWeek(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string
): Promise<{ active: ClassWithJoins[]; cancelled: ClassWithJoins[]; error: string | null }> {
  const [activeRes, cancelledRes] = await Promise.all([
    supabase
      .from('classes')
      .select('*, trainers(name), halls(name), enrollments(id, status)')
      .gte('starts_at', startISO)
      .lte('starts_at', endISO)
      .eq('is_cancelled', false)
      .order('starts_at'),
    supabase
      .from('classes')
      .select('*, trainers(name), halls(name), enrollments(id, status)')
      .gte('starts_at', startISO)
      .lte('starts_at', endISO)
      .eq('is_cancelled', true)
      .order('starts_at'),
  ])
  return {
    active: (activeRes.data ?? []) as ClassWithJoins[],
    cancelled: (cancelledRes.data ?? []) as ClassWithJoins[],
    error: activeRes.error?.message ?? cancelledRes.error?.message ?? null,
  }
}

export async function getClassById(
  supabase: SupabaseClient,
  classId: string
): Promise<{ data: (Class & { trainers: { name: string } | null; halls: { name: string } | null }) | null; error: string | null }> {
  const { data, error } = await supabase
    .from('classes')
    .select('*, trainers(name), halls(name)')
    .eq('id', classId)
    .maybeSingle()
  return { data: data as any ?? null, error: error?.message ?? null }
}

export async function updateClassCancelled(
  supabase: SupabaseClient,
  classId: string,
  isCancelled: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('classes').update({ is_cancelled: isCancelled }).eq('id', classId)
  return { error: error?.message ?? null }
}

export async function cancelClassAndRestoreSessions(
  supabase: SupabaseClient,
  classId: string
): Promise<{ restoredCount: number; error: string | null }> {
  const { data, error } = await supabase.rpc('cancel_class_and_restore_sessions', { p_class_id: classId })
  if (error || data?.[0]?.success === false) {
    return { restoredCount: 0, error: data?.[0]?.error_message ?? error?.message ?? 'Помилка' }
  }
  return { restoredCount: data?.[0]?.restored_count ?? 0, error: null }
}

export async function restoreClass(
  supabase: SupabaseClient,
  classId: string
): Promise<{ restoredCount: number; error: string | null }> {
  const { data, error } = await supabase.rpc('restore_class', { p_class_id: classId })
  if (error || data?.[0]?.success === false) {
    return { restoredCount: 0, error: data?.[0]?.error_message ?? error?.message ?? 'Помилка' }
  }
  return { restoredCount: data?.[0]?.restored_count ?? 0, error: null }
}

export async function listDatesWithClasses(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string
): Promise<{ data: Set<string>; error: string | null }> {
  const { data, error } = await supabase
    .from('classes')
    .select('starts_at')
    .gte('starts_at', startISO)
    .lte('starts_at', endISO)
    .eq('is_cancelled', false)
  const set = new Set<string>()
  for (const row of data ?? []) {
    const d = new Date(row.starts_at)
    set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return { data: set, error: error?.message ?? null }
}

export async function listSeriesTemplates(
  supabase: SupabaseClient
): Promise<{ data: ClassSeries[]; error: string | null }> {
  const { data, error } = await supabase
    .from('class_series')
    .select('*, trainers(name), halls(name), series_clients(id, client_id)')
    .eq('type', 'template')
    .order('day_of_week')
    .order('time_of_day')
  return { data: (data as ClassSeries[]) ?? [], error: error?.message ?? null }
}

export async function listPastClasses(
  supabase: SupabaseClient,
  page: number,
  pageSize: number = 20,
  filters?: {
    dateFrom?: string
    dateTo?: string
    hallId?: string
    trainerId?: string
    ticketType?: string
    isCancelled?: boolean
  }
): Promise<{ data: ClassWithJoins[]; count: number; error: string | null }> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoffISO = today.toISOString()

  let query = supabase
    .from('classes')
    .select('*, trainers(name), halls(name), enrollments(id, status)', { count: 'exact' })
    .lt('starts_at', cutoffISO)

  if (filters?.dateFrom) query = query.gte('starts_at', filters.dateFrom)
  if (filters?.dateTo)   query = query.lte('starts_at', filters.dateTo)
  if (filters?.hallId)   query = query.eq('hall_id', filters.hallId)
  if (filters?.trainerId) query = query.eq('trainer_id', filters.trainerId)
  if (filters?.ticketType) query = query.eq('ticket_type', filters.ticketType)
  if (filters?.isCancelled !== undefined) query = query.eq('is_cancelled', filters.isCancelled)

  query = query.order('starts_at', { ascending: false })

  const from = page * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, count, error } = await query
  return { data: (data ?? []) as ClassWithJoins[], count: count ?? 0, error: error?.message ?? null }
}
