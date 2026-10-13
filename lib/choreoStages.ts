import { formatTime } from '@/lib/formatters'
import { DOW_LABELS_SHORT } from '@/lib/dateUtils'
import type { TrainerStageClassRow } from '@/lib/queries/trainer-cabinet'

export type StageGroup = {
  key: string
  /** Назва заняття (title) або null — тоді UI підставляє лейбл типу. */
  title: string | null
  ticketType: string
  /** «Пн 19:00 · Великий зал» */
  meta: string
  /** Останній заповнений етап серед минулих занять групи. */
  lastStage: string | null
  /** Унікальні етапи групи (новіші першими) — для автопідказок. */
  stages: string[]
  /** Майбутні заняття групи (від now), за часом. */
  upcoming: TrainerStageClassRow[]
}

/** Ключ групи: серія, а для разових — назва/тип + день тижня + час. */
function groupKey(c: TrainerStageClassRow): string {
  if (c.series_id) return c.series_id
  const d = new Date(c.starts_at)
  return `${c.title || c.ticket_type}|${d.getDay()}|${formatTime(c.starts_at)}`
}

/**
 * Групує заняття тренера по групах для екрана етапів. Вхід — відсортований
 * за starts_at список (минулі + майбутні). Групи без майбутніх занять відкидаються;
 * порядок груп — за найближчим майбутнім заняттям.
 */
export function buildStageGroups(rows: TrainerStageClassRow[], now: Date): StageGroup[] {
  const nowMs = now.getTime()
  const map = new Map<string, StageGroup>()

  for (const c of rows) {
    const key = groupKey(c)
    let g = map.get(key)
    if (!g) {
      const d = new Date(c.starts_at)
      const hall = c.halls?.name
      g = {
        key,
        title: c.title,
        ticketType: c.ticket_type,
        meta: `${DOW_LABELS_SHORT[d.getDay()]} ${formatTime(c.starts_at)}${hall ? ` · ${hall}` : ''}`,
        lastStage: null,
        stages: [],
        upcoming: [],
      }
      map.set(key, g)
    }
    if (new Date(c.starts_at).getTime() >= nowMs) g.upcoming.push(c)
    else if (c.choreo_stage) g.lastStage = c.choreo_stage // rows asc → лишиться найсвіжіший
  }

  // Автопідказки: усі етапи групи, новіші першими, без дублів.
  for (const c of [...rows].reverse()) {
    const stage = c.choreo_stage?.trim()
    if (!stage) continue
    const g = map.get(groupKey(c))!
    if (!g.stages.includes(stage)) g.stages.push(stage)
  }

  return Array.from(map.values())
    .filter(g => g.upcoming.length > 0)
    .sort((a, b) => new Date(a.upcoming[0].starts_at).getTime() - new Date(b.upcoming[0].starts_at).getTime())
}
