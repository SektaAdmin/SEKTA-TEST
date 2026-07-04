'use client'
import { useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { listHallBusyIntervalsForDate, type HallBusyInterval } from '@/lib/queries/dashboard'
import { useRefs } from '@/contexts/RefsContext'
import { useListQuery } from '@/hooks/useListQuery'
import { CopyButton } from '@/components/ui/CopyButton'
import { BlockError } from './BlockError'
import styles from '../dashboard.module.css'

/* Блок 3: вільні вікна залів сьогодні (робочий день 8:00–22:00). */

/** Трикутник-попередження для алерту «студію нема кому відкрити». */
function WarnTriangleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
const DAY_START = 8 * 60   // 08:00
const DAY_END = 22 * 60    // 22:00

function minToStr(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

type Window = { from: number; to: number }

/** Вільні інтервали в межах робочого дня з урахуванням зайнятих. */
function computeFreeWindows(busy: HallBusyInterval[]): Window[] {
  const sorted = [...busy].sort((a, b) => a.startMin - b.startMin)
  const free: Window[] = []
  let cursor = DAY_START

  for (const b of sorted) {
    const start = Math.max(b.startMin, DAY_START)
    const end = Math.min(b.endMin, DAY_END)
    if (start > cursor) free.push({ from: cursor, to: start })
    cursor = Math.max(cursor, end)
  }
  if (cursor < DAY_END) free.push({ from: cursor, to: DAY_END })
  return free
}

/** Типи занять, що самі є орендою залу клієнтом — НЕ дають покриття студії
 * (їх відкриває персонал іншого заняття, не вони). */
const RENTAL_TYPES = new Set(['hallrental', 'smallhallrental'])

/** Чи це тренерське заняття, яке відкриває студію (є тренер, не оренда)?
 * busy містить лише активні заняття — скасовані/видалені вже відфільтровані. */
function isStudioStaffing(b: HallBusyInterval): boolean {
  return b.trainer != null && !RENTAL_TYPES.has(b.ticketType)
}

/** Покриття студії: проміжки, коли в студії хтось є (йде заняття з тренером).
 * Поза цими проміжками персоналу немає → зал у оренду не пропонуємо. */
function computeStudioCoverage(busy: HallBusyInterval[]): Window[] {
  const staffed = busy
    .filter(isStudioStaffing)
    .map(b => ({ from: Math.max(b.startMin, DAY_START), to: Math.min(b.endMin, DAY_END) }))
    .filter(w => w.to > w.from)
    .sort((a, b) => a.from - b.from)

  const merged: Window[] = []
  for (const w of staffed) {
    const last = merged[merged.length - 1]
    if (last && w.from <= last.to) last.to = Math.max(last.to, w.to)
    else merged.push({ ...w })
  }
  return merged
}

/** Чи інтервал [from,to) повністю покритий хоча б одним вікном покриття? */
function isCovered(from: number, to: number, coverage: Window[]): boolean {
  // Покриття вже відсортоване й змерджене (без перекриттів) — досить одного вікна.
  return coverage.some(c => c.from <= from && c.to >= to)
}

export type UncoveredRental = {
  hall: string
  clientName: string | null
  startMin: number
  endMin: number
}

/** Оренди, заброньовані клієнтом, у час яких немає жодного активного тренерського
 * заняття-маяка (нема кому відкрити студію). Переосмислений «маяк»: дивимось лише на
 * ПОТОЧНИЙ стан покриття, тож алерт спрацьовує однаково, чи маяк скасували
 * (is_cancelled), чи фізично видалили (delete_class) — в обох випадках його просто
 * немає в покритті. */
function computeUncoveredRentals(busy: HallBusyInterval[], coverage: Window[]): UncoveredRental[] {
  const rentals = busy.filter(b => RENTAL_TYPES.has(b.ticketType))
  const out: UncoveredRental[] = []
  for (const r of rentals) {
    const from = Math.max(r.startMin, DAY_START)
    const to = Math.min(r.endMin, DAY_END)
    if (to <= from) continue
    if (isCovered(from, to, coverage)) continue
    out.push({ hall: r.hall, clientName: r.clientName, startMin: from, endMin: to })
  }
  return out.sort((a, b) => a.startMin - b.startMin)
}

/** Перетин вільних вікон залу з покриттям студії. */
function intersectWindows(free: Window[], coverage: Window[]): Window[] {
  const out: Window[] = []
  for (const f of free) {
    for (const c of coverage) {
      const from = Math.max(f.from, c.from)
      const to = Math.min(f.to, c.to)
      if (to > from) out.push({ from, to })
    }
  }
  return out
}

const SLOT_STEP = 60   // крок розбиття вікна на окремі слоти, хв

/** Розбиває вільні вікна на погодинні слоти (неповний хвіст лишається як є). */
function splitIntoHourSlots(free: Window[]): Window[] {
  const slots: Window[] = []
  for (const w of free) {
    for (let from = w.from; from < w.to; from += SLOT_STEP) {
      slots.push({ from, to: Math.min(from + SLOT_STEP, w.to) })
    }
  }
  return slots
}

/** Текст для копіювання: кожен слот окремим рядком, щоб клієнт обрав і забронював. */
function buildHallSlotsText(hallName: string, free: Window[]): string {
  if (free.length === 0) return `${hallName}: немає вільних слотів`
  const lines = splitIntoHourSlots(free).map(w => `з ${minToStr(w.from)} до ${minToStr(w.to)}`)
  return `${hallName}:\n${lines.join('\n')}`
}

export function FreeSlotsBlock({ date }: { date: string }) {
  const { halls } = useRefs()
  const { data: busy, loading, error, refetch } = useListQuery<HallBusyInterval>(
    () => listHallBusyIntervalsForDate(supabase, date),
    [date],
    { realtime: ['classes', 'enrollments'] }
  )

  useEffect(() => {
    if (error) console.error('[FreeSlotsBlock]', error)
  }, [error])

  // Покриття студії = час, коли в студії хтось є (йде активне заняття з тренером).
  const coverage = useMemo(() => computeStudioCoverage(busy), [busy])

  // Оренди, що лишились без персоналу після скасування тренерського заняття.
  const uncovered = useMemo(() => computeUncoveredRentals(busy, coverage), [busy, coverage])

  const byHall = useMemo(() => {
    // Зал можна здати в оренду лише в межах покриття — є кому впустити/відкрити.
    if (coverage.length === 0) return []

    const activeHalls = halls.filter(h => h.is_active)
    return activeHalls
      .map(h => {
        const hallBusy = busy.filter(b => b.hall === h.name)
        const free = intersectWindows(computeFreeWindows(hallBusy), coverage)
        return { hall: h.name, free }
      })
      // Зал без жодного вільного слоту в межах покриття не показуємо взагалі.
      .filter(h => h.free.length > 0)
  }, [halls, busy, coverage])

  return (
    <section className={`${styles.block} ${styles.equalBlock}`}>
      <div className={styles.cardHead}>
        <h2 className={styles.blockTitle}>Оренда залу</h2>
      </div>

      <div className={styles.scrollBody}>
      {loading && <div className="loading-dots" role="status" aria-label="Завантаження..."><span /><span /><span /></div>}
      {error && <BlockError onRetry={refetch} />}

      {!loading && !error && uncovered.map((u, i) => (
        <div key={i} className={styles.slotAlert} role="alert">
          <WarnTriangleIcon className={styles.slotAlertIcon} />
          <div className={styles.slotAlertBody}>
            <span className={styles.slotAlertTitle}>{u.clientName ?? 'Студію нема кому відкрити'}</span>
            <span className={styles.slotAlertText}>Оренда {u.hall} {minToStr(u.startMin)}–{minToStr(u.endMin)}</span>
            <span className={styles.slotAlertText}>У цей час немає заняття з тренером.</span>
          </div>
        </div>
      ))}

      {!loading && !error && byHall.length === 0 && (
        <div className={styles.empty}>Сьогодні студія без занять — оренду немає кому відкрити.</div>
      )}

      {!loading && !error && byHall.map(h => (
        <div key={h.hall} className={styles.slotRow}>
          <CopyButton
            className={styles.slotHallBtn}
            label={h.hall}
            copiedLabel="Скопійовано"
            text={() => buildHallSlotsText(h.hall, h.free)}
            title="Скопіювати слоти"
            ariaLabel={`Скопіювати слоти залу ${h.hall}`}
          />
          <div className={styles.slotWindows}>
            {splitIntoHourSlots(h.free).map(w => (
              <span key={w.from} className={`${styles.geistBadge} ${styles.geistBadgeSuccess}`}>
                {minToStr(w.from)}–{minToStr(w.to)}
              </span>
            ))}
          </div>
        </div>
      ))}
      </div>
    </section>
  )
}
