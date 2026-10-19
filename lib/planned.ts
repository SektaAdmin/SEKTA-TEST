/* «Заплановане» — словники та чиста логіка відкладених змін запису.
   Дані — lib/queries/planned.ts; БД — міграція 20261019_planned_enrollments.sql. */

import { DOW_LABELS_SHORT } from '@/lib/dateUtils'
import type { ProjectedSlot } from '@/lib/queries/planned'

export type PlannedAction = 'skip' | 'enroll'
/** Вид у реєстрі: 2 дії planned_enrollment_changes + 2 періоди (series_clients / class_series). */
export type PlannedKind = PlannedAction | 'temp_regular' | 'temp_template'
export type PlannedStatus = 'pending' | 'active' | 'attention' | 'done'

/** Елемент результату _planned_apply_range (preview/create/upsert). */
export interface PlannedApplyItem {
  class_id: string | null
  starts_at: string
  result:
    | 'pending'          // тиждень не відкрито — спрацює в generate_week
    | 'cancelled'        // запис відмінено (до дедлайну, без списання)
    | 'after_deadline'   // дедлайн минув — рішення за адміном
    | 'not_enrolled'     // відміняти нічого
    | 'enrolled'
    | 'waitlist'
    | 'already'          // уже записаний
    | 'class_cancelled'  // заняття скасоване студією
    | 'not_own'          // тренер: заняття серії перепризначене іншому тренеру — не чіпаємо
  no_sessions?: boolean
  client_conflict?: boolean
}

/** Порушення generate_week: намір не виконано повністю. */
export interface GenerateWarning {
  client_name: string
  series_title: string | null
  ticket_type: string
  class_date: string
  time_of_day: string
  reason: 'waitlist' | 'no_sessions' | 'class_missing'
}

export const KIND_LABEL: Record<PlannedKind, string> = {
  skip: 'Пауза',
  enroll: 'Запис наперед',
  temp_regular: 'Тимчасовий постійник',
  temp_template: 'Тимчасовий шаблон',
}

export const STATUS_LABEL: Record<PlannedStatus, string> = {
  pending: 'Очікує',
  active: 'Діє',
  attention: 'Потребує уваги',
  done: 'Завершено',
}

/** Сірий = спокій; колір лише для справжнього алерту (feedback_dashboard_neutral_over_semantic). */
export function statusBadgeClass(s: string): string {
  if (s === 'attention') return 'badge badge-warning'
  if (s === 'active') return 'badge badge-success'
  return 'badge badge-type'
}

export const WARNING_REASON: Record<GenerateWarning['reason'], string> = {
  waitlist: 'у черзі — немає місць',
  no_sessions: 'немає оплачених занять',
  class_missing: 'заняття не створено (скасоване або конфлікт)',
}

/** «Стретчинг Пн 19:00» з полів шаблону. */
export function seriesLabel(s: { title: string | null; day_of_week: number; time_of_day: string }, typeLabel?: string): string {
  const name = s.title || typeLabel || ''
  return [name, DOW_LABELS_SHORT[s.day_of_week], s.time_of_day.slice(0, 5)].filter(Boolean).join(' ')
}

/** ДД.ММ з РРРР-ММ-ДД без TZ-ризику. */
export function ymdShort(ymd: string): string {
  const [, m, d] = ymd.split('-')
  return `${d}.${m}`
}

export function periodLabel(from: string | null, to: string | null): string {
  if (from && to) return from === to ? ymdShort(from) : `${ymdShort(from)}–${ymdShort(to)}`
  if (to) return `до ${ymdShort(to)}`
  if (from) return `з ${ymdShort(from)}`
  return 'безстроково'
}

/** Київська дата заняття з ISO. */
export function kyivDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', weekday: 'short', timeZone: 'Europe/Kyiv' })
}

export const RESULT_LABEL: Record<PlannedApplyItem['result'], string> = {
  pending: 'при відкритті тижня',
  cancelled: 'запис скасовано',
  after_deadline: 'дедлайн минув — вирішіть вручну',
  not_enrolled: 'не записаний',
  enrolled: 'записано',
  waitlist: 'у черзі',
  already: 'вже записаний',
  class_cancelled: 'заняття скасоване',
  not_own: 'веде інший тренер — не змінено',
}

/** Чи потребує елемент уваги адміна. */
export function itemNeedsAttention(i: PlannedApplyItem): boolean {
  return i.result === 'after_deadline' || i.result === 'waitlist' || i.result === 'class_cancelled' || i.result === 'not_own'
    || (i.no_sessions === true && i.result === 'enrolled')
}

/** Підсумок для превʼю/тосту: «2 скасовано · 1 після дедлайну · 3 при відкритті». */
export function summarizeApplied(items: PlannedApplyItem[], mode: 'preview' | 'done'): string {
  const n = (r: PlannedApplyItem['result']) => items.filter(i => i.result === r).length
  const parts: string[] = []
  const cancelled = n('cancelled')
  const enrolled = n('enrolled')
  if (cancelled) parts.push(`${cancelled} ${mode === 'preview' ? 'буде скасовано' : 'скасовано'}`)
  if (enrolled) parts.push(`${enrolled} ${mode === 'preview' ? 'буде записано' : 'записано'}`)
  if (n('waitlist')) parts.push(`${n('waitlist')} у черзі`)
  if (n('after_deadline')) parts.push(`${n('after_deadline')} після дедлайну — вирішіть вручну`)
  const noSessions = items.filter(i => i.no_sessions && (i.result === 'enrolled' || i.result === 'waitlist')).length
  if (noSessions) parts.push(`${noSessions} без оплачених занять`)
  if (n('pending')) parts.push(`${n('pending')} при відкритті тижня`)
  return parts.join(' · ') || 'Відкритих занять у цьому періоді немає'
}

// ── Примарні слоти в сітці розкладу ─────────────────────────────
// Заняття шаблону на дату, де тиждень ще не відкрито, рендеримо як псевдо-заняття
// (id «ghost:<series>:<date>»), щоб сітка/доріжки/мобільний тайм-лайн працювали
// без змін; клік перехоплюється → GhostSlotModal. Спільне для /schedule і /trainer/schedule.
export const GHOST_PREFIX = 'ghost:'
export const isGhostId = (id: string) => id.startsWith(GHOST_PREFIX)

export function parseGhostId(id: string): { seriesId: string; date: string } {
  const [, seriesId, date] = id.split(':')
  return { seriesId, date }
}

export function ghostToClass(
  g: ProjectedSlot,
  trainerName: string | null,
  hallName: string | null,
) {
  return {
    id: `${GHOST_PREFIX}${g.series_id}:${g.class_date}`,
    trainer_id: g.trainer_id,
    hall_id: g.hall_id,
    ticket_type: g.ticket_type,
    title: g.title,
    starts_at: g.starts_at,
    duration_min: g.duration_min,
    capacity: g.capacity,
    is_cancelled: false,
    notes: null,
    choreo_stage: null,
    series_id: g.series_id,
    created_at: g.starts_at,
    updated_at: g.starts_at,
    trainers: trainerName ? { name: trainerName } : null,
    halls: hallName ? { name: hallName } : null,
    // Майбутній склад (без пауз) — лічильник місць показує заповненість наперед.
    enrollments: Array.from({ length: g.roster_count }, (_, i) => ({ id: `${g.series_id}-${i}`, status: 'enrolled' })),
  }
}
