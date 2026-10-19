import type { Db } from '@/lib/queries/_db'
import type { Database } from '@/types/database.types'
import { callRpc } from '@/lib/rpc'
import { kyivDayUtcBounds } from '@/lib/dateUtils'
import type { PlannedApplyItem, PlannedAction } from '@/lib/planned'

/* «Заплановане» — відкладені зміни запису (міграція 20261019_planned_enrollments.sql).
   Пауза / запис наперед / тимчасовий постійник застосовуються одразу до відкритих
   занять і автоматично в generate_week для невідкритих. Тренеру RPC самі
   обмежують скоуп своїми серіями (can_manage_series / planned_register). */

type Fns = Database['public']['Functions']

export type PlannedRegisterRow = Fns['planned_register']['Returns'][number]
export type ProjectedSlot = Fns['projected_template_slots']['Returns'][number]
export type RosterRow = Fns['series_roster']['Returns'][number]

export async function listPlannedRegister(
  supabase: Db,
  params: { trainerId?: string; clientId?: string; includeDone?: boolean } = {}
): Promise<{ data: PlannedRegisterRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('planned_register', {
    // undefined (не null) — інакше PostgREST шукає перевантаження з явним NULL.
    p_trainer_id: params.trainerId || undefined,
    p_client_id: params.clientId || undefined,
    p_include_done: params.includeDone ?? false,
  })
  return { data: data ?? [], error: error?.message ?? null }
}

interface ChangeParams {
  seriesId: string
  clientId: string
  action: PlannedAction
  dateFrom: string
  dateTo: string
}

/** Dry-run: що станеться з кожною датою періоду. Нічого не пише. */
export async function previewPlannedChange(
  supabase: Db,
  p: ChangeParams
): Promise<{ items: PlannedApplyItem[]; error: string | null }> {
  const { row, success, error } = await callRpc<{ success: boolean; items: unknown; error_message: string | null }>(
    () => supabase.rpc('preview_planned_change', {
      p_series_id: p.seriesId, p_client_id: p.clientId, p_action: p.action,
      p_date_from: p.dateFrom, p_date_to: p.dateTo,
    }),
    'Не вдалося порахувати наслідки'
  )
  if (!success) return { items: [], error }
  return { items: (row?.items ?? []) as PlannedApplyItem[], error: null }
}

export async function createPlannedChange(
  supabase: Db,
  p: ChangeParams & { note?: string }
): Promise<{ applied: PlannedApplyItem[]; error: string | null }> {
  const { row, success, error } = await callRpc<{ success: boolean; applied: unknown; error_message: string | null }>(
    () => supabase.rpc('create_planned_change', {
      p_series_id: p.seriesId, p_client_id: p.clientId, p_action: p.action,
      p_date_from: p.dateFrom, p_date_to: p.dateTo, p_note: p.note || undefined,
    }),
    'Не вдалося зберегти зміну'
  )
  if (!success) return { applied: [], error }
  return { applied: (row?.applied ?? []) as PlannedApplyItem[], error: null }
}

export async function cancelPlannedChange(
  supabase: Db,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await callRpc<{ success: boolean; error_message: string | null }>(
    () => supabase.rpc('cancel_planned_change', { p_id: id }),
    'Не вдалося скасувати'
  )
  return { error }
}

/** Тимчасовий постійник: додати / змінити період. null/null = безстроково. */
export async function upsertSeriesClientPeriod(
  supabase: Db,
  p: { seriesId: string; clientId: string; validFrom: string | null; validTo: string | null }
): Promise<{ applied: PlannedApplyItem[]; error: string | null }> {
  const { row, success, error } = await callRpc<{ success: boolean; applied: unknown; error_message: string | null }>(
    () => supabase.rpc('upsert_series_client_period', {
      p_series_id: p.seriesId,
      p_client_id: p.clientId,
      // NULL — значуще («без межі»); генератор типів не знає, що параметр nullable.
      p_valid_from: p.validFrom as string,
      p_valid_to: p.validTo as string,
    }),
    'Не вдалося зберегти період'
  )
  if (!success) return { applied: [], error }
  return { applied: (row?.applied ?? []) as PlannedApplyItem[], error: null }
}

/** Примарні слоти: заняття шаблонів на дати, де тиждень ще не відкрито. */
export async function listProjectedSlots(
  supabase: Db,
  fromYMD: string,
  toYMD: string
): Promise<{ data: ProjectedSlot[]; error: string | null }> {
  const { data, error } = await supabase.rpc('projected_template_slots', { p_from: fromYMD, p_to: toYMD })
  return { data: data ?? [], error: error?.message ?? null }
}

/** Склад заняття серії на дату: постійники (з паузами), тимчасові, записані наперед. */
export async function getSeriesRoster(
  supabase: Db,
  seriesId: string,
  dateYMD: string
): Promise<{ data: RosterRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('series_roster', { p_series_id: seriesId, p_date: dateYMD })
  return { data: data ?? [], error: error?.message ?? null }
}

/** Групи, де клієнт постійник (для паузи) — з назвою/днем/часом шаблону. */
export async function listClientSeries(
  supabase: Db,
  clientId: string
): Promise<{ data: { id: string; valid_from: string | null; valid_to: string | null; series_id: string;
  class_series: { id: string; title: string | null; ticket_type: string; day_of_week: number; time_of_day: string;
    trainer_id: string | null; trainers: { name: string } | null } | null }[]; error: string | null }> {
  const { data, error } = await supabase
    .from('series_clients')
    .select('id, valid_from, valid_to, series_id, class_series(id, title, ticket_type, day_of_week, time_of_day, trainer_id, trainers(name))')
    .eq('client_id', clientId)
  return { data: data ?? [], error: error?.message ?? null }
}

/**
 * Перетин із примарним слотом шаблону (тиждень ще не відкрито) → людське
 * повідомлення або null. Доповнює checkClassConflicts для занять наперед.
 */
export async function checkTemplateSlotConflicts(
  supabase: Db,
  params: { starts_at: string; duration_min: number; hall_id: string | null; trainer_id: string | null }
): Promise<string | null> {
  if (!params.hall_id && !params.trainer_id) return null
  const { data, error } = await supabase.rpc('check_template_slot_conflicts', {
    p_starts_at: params.starts_at,
    p_duration_min: params.duration_min,
    p_hall_id: params.hall_id ?? undefined,
    p_trainer_id: params.trainer_id ?? undefined,
  })
  if (error) return 'Не вдалося перевірити шаблони — спробуйте ще раз'
  if (!data || data.length === 0) return null
  const c = data[0]
  const time = new Date(c.starts_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' })
  const who = c.conflict_type === 'hall' ? 'Зал' : 'Тренер'
  return `${who} зайнятий за шаблоном о ${time}${c.title ? ` («${c.title}»)` : ''} — тиждень ще не відкрито`
}

export interface PlannedDateRow {
  classId: string | null
  startsAt: string
  isCancelled: boolean
  /** Статус запису клієнта на цьому занятті (null — запису нема / вид без клієнта). */
  enrollment: { status: string; cancellation_source: string | null } | null
  /** Заняття ще не створене — тиждень не відкрито. */
  pending: boolean
}

/** Деталь запису реєстру: усі дати періоду — створені заняття серії + примарні. */
export async function listPlannedItemDates(
  supabase: Db,
  p: { seriesId: string; clientId: string | null; from: string; to: string | null }
): Promise<{ data: PlannedDateRow[]; error: string | null }> {
  const fromIso = kyivDayUtcBounds(p.from).from
  let q = supabase
    .from('classes')
    .select('id, starts_at, is_cancelled, enrollments(status, cancellation_source, client_id)')
    .eq('series_id', p.seriesId)
    .gte('starts_at', fromIso)
    .order('starts_at')
  if (p.to) q = q.lte('starts_at', kyivDayUtcBounds(p.to).to)
  // Вбудований фільтр: лише запис цього клієнта (решта складу не потрібна).
  if (p.clientId) q = q.eq('enrollments.client_id', p.clientId)
  const [{ data: classes, error }, projected] = await Promise.all([
    q,
    // Примарні — від сьогодні (минулих не буває), RPC обрізає до 63 днів.
    listProjectedSlots(supabase, p.from > todayKyiv() ? p.from : todayKyiv(), p.to ?? addDaysYMD(todayKyiv(), 62)),
  ])
  if (error) return { data: [], error: error.message }

  const rows: PlannedDateRow[] = (classes ?? []).map(c => ({
    classId: c.id,
    startsAt: c.starts_at,
    isCancelled: c.is_cancelled,
    enrollment: p.clientId && c.enrollments[0]
      ? { status: c.enrollments[0].status, cancellation_source: c.enrollments[0].cancellation_source }
      : null,
    pending: false,
  }))
  for (const s of projected.data.filter(s => s.series_id === p.seriesId)) {
    rows.push({ classId: null, startsAt: s.starts_at, isCancelled: false, enrollment: null, pending: true })
  }
  rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  return { data: rows, error: projected.error }
}

function todayKyiv(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' })
}

function addDaysYMD(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

/** Активні (не минулі) зміни серії — бейджі пауз і «записані наперед» у SeriesModal. */
export async function listSeriesPlannedChanges(
  supabase: Db,
  seriesId: string
): Promise<{ data: { id: string; client_id: string; action: string; date_from: string; date_to: string;
  clients: { first_name: string | null; last_name: string | null } | null }[]; error: string | null }> {
  const { data, error } = await supabase
    .from('planned_enrollment_changes')
    .select('id, client_id, action, date_from, date_to, clients(first_name, last_name)')
    .eq('series_id', seriesId)
    .eq('is_active', true)
    .gte('date_to', todayKyiv())
    .order('date_from')
  return { data: data ?? [], error: error?.message ?? null }
}
