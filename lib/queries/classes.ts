import type { SupabaseClient } from '@supabase/supabase-js'
import type { Class, ClassSeries } from '@/types'

type ClassWithJoins = Class & {
  trainers: { name: string } | null
  halls: { name: string } | null
  enrollments: { id: string; status: string }[]
}

export async function listClassesForWeek(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string
): Promise<{ active: ClassWithJoins[]; cancelled: ClassWithJoins[] }> {
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
  }
}

export async function getClassById(
  supabase: SupabaseClient,
  classId: string
): Promise<(Class & { trainers: { name: string } | null; halls: { name: string } | null }) | null> {
  const { data, error } = await supabase
    .from('classes')
    .select('*, trainers(name), halls(name)')
    .eq('id', classId)
    .single()
  if (error || !data) return null
  return data as any
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

export async function listDatesWithClasses(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string
): Promise<Set<string>> {
  const { data } = await supabase
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
  return set
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
