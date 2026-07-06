import type { QueryData } from '@supabase/supabase-js'
import type { Db, Insert } from '@/lib/queries/_db'
import type { Class, ClassSeries } from '@/types'
import { callRpc } from '@/lib/rpc'
import { kyivDayUtcBounds } from '@/lib/dateUtils'

export type ClassWithJoins = Class & {
  trainers: { name: string } | null
  halls: { name: string } | null
  enrollments: { id: string; status: string }[]
}

/** Спільні поля для INSERT/UPDATE одного заняття. */
export interface ClassPayload {
  ticket_type: string
  trainer_id: string | null
  hall_id: string | null
  starts_at: string
  duration_min: number
  capacity: number | null
  title: string | null
  notes: string | null
}

/** Спільні поля для INSERT/UPDATE шаблону серії. `starts_at`-незалежні. */
export interface SeriesPayload {
  ticket_type: string
  trainer_id: string | null
  hall_id: string | null
  duration_min: number
  capacity: number | null
  title: string | null
  notes: string | null
  day_of_week?: number
  time_of_day?: string
}

const SERIES_CLIENT_SELECT = 'id, client_id, hours_attended, clients(first_name, last_name)' as const
function seriesClientQuery(supabase: Db) {
  return supabase.from('series_clients').select(SERIES_CLIENT_SELECT)
}
export type SeriesClientRow = QueryData<ReturnType<typeof seriesClientQuery>>[number]

export async function listClassesForWeek(
  supabase: Db,
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
  supabase: Db,
  classId: string
): Promise<{ data: (Class & { trainers: { name: string } | null; halls: { name: string } | null }) | null; error: string | null }> {
  const { data, error } = await supabase
    .from('classes')
    .select('*, trainers(name), halls(name)')
    .eq('id', classId)
    .maybeSingle()

  return { data: (data as (Class & { trainers: { name: string } | null; halls: { name: string } | null }) | null) ?? null, error: error?.message ?? null }
}

export async function updateClassCancelled(
  supabase: Db,
  classId: string,
  isCancelled: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('classes').update({ is_cancelled: isCancelled }).eq('id', classId)
  return { error: error?.message ?? null }
}

export async function updateClassChoreoStage(
  supabase: Db,
  classId: string,
  choreoStage: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('classes')
    .update({ choreo_stage: choreoStage })
    .eq('id', classId)
  return { error: error?.message ?? null }
}

export async function cancelClassAndRestoreSessions(
  supabase: Db,
  classId: string
): Promise<{ restoredCount: number; error: string | null }> {
  const { row, success, error } = await callRpc<{ success: boolean; error_message: string | null; restored_count: number }>(
    () => supabase.rpc('cancel_class_and_restore_sessions', { p_class_id: classId })
  )
  if (!success) return { restoredCount: 0, error }
  return { restoredCount: row?.restored_count ?? 0, error: null }
}

export async function restoreClass(
  supabase: Db,
  classId: string
): Promise<{ restoredCount: number; error: string | null }> {
  const { row, success, error } = await callRpc<{ success: boolean; error_message: string | null; restored_count: number }>(
    () => supabase.rpc('restore_class', { p_class_id: classId })
  )
  if (!success) return { restoredCount: 0, error }
  return { restoredCount: row?.restored_count ?? 0, error: null }
}

/**
 * Фізично видалити помилково створене заняття разом із записами (CASCADE).
 * На відміну від cancelClassAndRestoreSessions (м'яке, лишається в історії) —
 * для занять, яких не повинно існувати взагалі. Реверс сесій по всіх записах
 * відбувається в RPC ПЕРЕД DELETE. Свідомий виняток з «м'яких видалень» (інв. #7).
 */
export async function deleteClass(
  supabase: Db,
  classId: string
): Promise<{ restoredCount: number; error: string | null }> {
  const { row, success, error } = await callRpc<{ success: boolean; error_message: string | null; restored_count: number }>(
    () => supabase.rpc('delete_class', { p_class_id: classId })
  )
  if (!success) return { restoredCount: 0, error }
  return { restoredCount: row?.restored_count ?? 0, error: null }
}

export async function listDatesWithClasses(
  supabase: Db,
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
  supabase: Db
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
  supabase: Db,
  page: number,
  pageSize: number = 20,
  filters?: {
    dateFrom?: string
    dateTo?: string
    hallId?: string
    trainerId?: string
    ticketType?: string
    isCancelled?: boolean
    clientId?: string
  }
): Promise<{ data: ClassWithJoins[]; count: number; error: string | null }> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoffISO = today.toISOString()

  // Пошук по клієнту: окремий aliased inner-join (filt) звужує заняття до тих,
  // де клієнт має нескасований запис. Основний embed enrollments(id, status)
  // лишається повним — щоб колонка «Записів» показувала реальну кількість.
  const clientJoin = filters?.clientId
    ? ', filt:enrollments!inner(client_id, status)'
    : ''

  let query = supabase
    .from('classes')
    .select(`*, trainers(name), halls(name), enrollments(id, status)${clientJoin}`, { count: 'exact' })
    .lt('starts_at', cutoffISO)

  if (filters?.dateFrom) query = query.gte('starts_at', kyivDayUtcBounds(filters.dateFrom).from)
  if (filters?.dateTo)   query = query.lte('starts_at', kyivDayUtcBounds(filters.dateTo).to)
  if (filters?.hallId)   query = query.eq('hall_id', filters.hallId)
  if (filters?.trainerId) query = query.eq('trainer_id', filters.trainerId)
  if (filters?.ticketType) query = query.eq('ticket_type', filters.ticketType)
  if (filters?.isCancelled !== undefined) query = query.eq('is_cancelled', filters.isCancelled)
  if (filters?.clientId) {
    query = query
      .eq('filt.client_id', filters.clientId)
      .neq('filt.status', 'cancelled')
  }

  query = query.order('starts_at', { ascending: false })

  const from = page * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, count, error } = await query
  // Динамічний select-рядок (clientJoin) не парситься типовим клієнтом —
  // звужуємо результат до доменного типу через unknown.
  return { data: (data ?? []) as unknown as ClassWithJoins[], count: count ?? 0, error: error?.message ?? null }
}

/** Мінімальний зріз заняття для матриці підбору слота (SlotFinderModal). */
export type SlotFinderClass = {
  id: string
  ticket_type: string
  starts_at: string
  duration_min: number
  hall_id: string | null
  trainer_id: string | null
}

export async function listClassesForSlotFinder(
  supabase: Db,
  date: string
): Promise<{ data: SlotFinderClass[]; error: string | null }> {
  const { from: dayStart, to: dayEnd } = kyivDayUtcBounds(date)
  const { data, error } = await supabase
    .from('classes')
    .select('id, ticket_type, starts_at, duration_min, hall_id, trainer_id')
    .gte('starts_at', dayStart)
    .lte('starts_at', dayEnd)
    .eq('is_cancelled', false)
    .returns<SlotFinderClass[]>()
  return { data: data ?? [], error: error?.message ?? null }
}

// ── Mutations: classes ──────────────────────────────────────────

export async function insertClasses(
  supabase: Db,
  payloads: (ClassPayload & { series_id?: string })[]
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('classes').insert(payloads)
  return { error: error?.message ?? null }
}

/** INSERT одного заняття з поверненням id — коли одразу потрібен запис клієнта. */
export async function insertClassReturningId(
  supabase: Db,
  payload: ClassPayload
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('classes')
    .insert(payload)
    .select('id')
    .single()
  return { id: data?.id ?? null, error: error?.message ?? null }
}

export async function updateClass(
  supabase: Db,
  classId: string,
  payload: ClassPayload
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('classes').update(payload).eq('id', classId)
  return { error: error?.message ?? null }
}

/** Майбутні (>= now) нескасовані заняття серії — для edit-scope 'future'. */
export async function listFutureSeriesClasses(
  supabase: Db,
  seriesId: string
): Promise<{ data: { id: string; starts_at: string }[]; error: string | null }> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('classes')
    .select('id, starts_at')
    .eq('series_id', seriesId)
    .gte('starts_at', now)
    .eq('is_cancelled', false)
  return { data: (data ?? []) as { id: string; starts_at: string }[], error: error?.message ?? null }
}

/** Bulk-update майбутніх занять серії (edit-scope 'future'). */
export async function updateFutureSeriesClasses(
  supabase: Db,
  seriesId: string,
  payload: ClassPayload
): Promise<{ error: string | null }> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('classes')
    .update(payload)
    .eq('series_id', seriesId)
    .gte('starts_at', now)
    .eq('is_cancelled', false)
  return { error: error?.message ?? null }
}

// ── Mutations: class_series ─────────────────────────────────────

export async function insertSeries(
  supabase: Db,
  payload: Insert<'class_series'> & { type: 'template' | 'series' }
): Promise<{ data: ClassSeries | null; error: string | null }> {
  const { data, error } = await supabase.from('class_series').insert(payload).select().single()
  // Row.type — text у схемі; доменний ClassSeries звужує до 'template'|'series'.
  return { data: data ? { ...data, type: data.type as 'template' | 'series' } : null, error: error?.message ?? null }
}

export async function updateSeries(
  supabase: Db,
  seriesId: string,
  payload: SeriesPayload
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('class_series').update(payload).eq('id', seriesId)
  return { error: error?.message ?? null }
}

export async function deleteSeries(
  supabase: Db,
  seriesId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('class_series').delete().eq('id', seriesId)
  return { error: error?.message ?? null }
}

// ── Mutations: series_clients (постійники) ──────────────────────

export async function listSeriesClients(
  supabase: Db,
  seriesId: string
): Promise<{ data: SeriesClientRow[]; error: string | null }> {
  const { data, error } = await seriesClientQuery(supabase)
    .eq('series_id', seriesId)
    .order('created_at')
  return { data: data ?? [], error: error?.message ?? null }
}

export async function addSeriesClient(
  supabase: Db,
  seriesId: string,
  clientId: string,
  hoursAttended?: number[]
): Promise<{ error: string | null }> {
  const payload: Insert<'series_clients'> = { series_id: seriesId, client_id: clientId }
  if (hoursAttended !== undefined) payload.hours_attended = hoursAttended
  const { error } = await supabase.from('series_clients').insert(payload)
  return { error: error?.message ?? null }
}

export async function removeSeriesClient(
  supabase: Db,
  rowId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('series_clients').delete().eq('id', rowId)
  return { error: error?.message ?? null }
}

// ── Week generation / template teardown (/schedule/templates) ───

/** Слот шаблону, пропущений generate_week через перетин по залу/тренеру. */
export interface GeneratedConflict {
  series_title: string | null
  ticket_type: string
  class_date: string
  time_of_day: string
  hall_name: string | null
  conflict_type: 'hall' | 'trainer'
  conflict_with_title: string
  conflict_with_starts_at: string
}

export async function generateWeek(
  supabase: Db,
  monday: string,
  weeks: number = 1
): Promise<{ classesCreated: number; enrollmentsCreated: number; conflicts: GeneratedConflict[]; error: string | null }> {
  const { data, error } = await supabase.rpc('generate_week', { p_start_date: monday, p_weeks: weeks })
  if (error) return { classesCreated: 0, enrollmentsCreated: 0, conflicts: [], error: error.message }
  // jsonb-колонка типізується як Json — форму елементів гарантує сама RPC.
  const conflicts = (data?.[0]?.conflicts ?? []) as unknown as GeneratedConflict[]
  return {
    classesCreated: data?.[0]?.classes_created ?? 0,
    enrollmentsCreated: data?.[0]?.enrollments_created ?? 0,
    conflicts,
    error: null,
  }
}

/** id-шники всіх шаблонів тижня (type='template') — для bulk-видалення тижня. */
export async function listTemplateSeriesIds(
  supabase: Db
): Promise<{ data: string[]; error: string | null }> {
  const { data, error } = await supabase.from('class_series').select('id').eq('type', 'template')
  return { data: (data ?? []).map((s: { id: string }) => s.id), error: error?.message ?? null }
}

/** Видалити заняття вказаних серій у напіввідкритому діапазоні [from, to). */
export async function deleteClassesInRange(
  supabase: Db,
  seriesIds: string[],
  fromISO: string,
  toISO: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('classes')
    .delete()
    .in('series_id', seriesIds)
    .gte('starts_at', fromISO)
    .lt('starts_at', toISO)
  return { error: error?.message ?? null }
}

// ── Conflict check ──────────────────────────────────────────────

/**
 * Перевірка перетину по залу/тренеру. Повертає готове людське повідомлення
 * (або null, якщо конфлікту нема). Бізнес-логіка форматування спільна для
 * ClassModal і ClassDetailModal — тримаємо тут, не дублюємо.
 */
export async function checkClassConflicts(
  supabase: Db,
  params: {
    starts_at: string
    duration_min: number
    hall_id: string | null
    trainer_id: string | null
    exclude_id?: string
  }
): Promise<string | null> {
  if (!params.hall_id && !params.trainer_id) return null
  const { data } = await supabase.rpc('check_class_conflicts', {
    p_starts_at: params.starts_at,
    p_duration_min: params.duration_min,
    p_hall_id: params.hall_id ?? undefined,
    p_trainer_id: params.trainer_id ?? undefined,
    p_exclude_id: params.exclude_id ?? undefined,
  })
  if (!data || data.length === 0) return null
  const c = data[0]
  const when = new Date(c.starts_at).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })
  const who = c.conflict_type === 'hall' ? 'Зал' : 'Тренер'
  const label = c.title || c.ticket_type
  return `${who} зайнятий — конфлікт із заняттям «${label}» о ${when}`
}
