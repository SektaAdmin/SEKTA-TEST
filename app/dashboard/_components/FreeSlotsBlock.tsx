'use client'
import { useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { MSG } from '@/lib/messages'
import { supabase } from '@/lib/supabase'
import { listHallBusyIntervalsForDate, type HallBusyInterval } from '@/lib/queries/dashboard'
import { useRefs } from '@/contexts/RefsContext'
import { useListQuery } from '@/hooks/useListQuery'
import { CopyIcon } from '@/components/icons/navigation'
import { BlockError } from './BlockError'
import styles from '../dashboard.module.css'

/* Блок 3: вільні вікна залів сьогодні (робочий день 8:00–22:00). */
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

/** Покриття студії: проміжки, коли в студії хтось є (йде заняття з тренером).
 * Поза цими проміжками персоналу немає → зал у оренду не пропонуємо. */
function computeStudioCoverage(busy: HallBusyInterval[]): Window[] {
  const staffed = busy
    .filter(b => b.trainer != null)
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
    { realtime: ['classes'] }
  )

  useEffect(() => {
    if (error) console.error('[FreeSlotsBlock]', error)
  }, [error])

  const byHall = useMemo(() => {
    // Покриття студії = час, коли в студії хтось є (йде заняття з тренером).
    // Зал можна здати в оренду лише в межах цього часу — є кому впустити/відкрити.
    const coverage = computeStudioCoverage(busy)
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
  }, [halls, busy])

  function handleCopyHall(hallName: string, free: Window[]) {
    const text = buildHallSlotsText(hallName, free)
    navigator.clipboard.writeText(text)
      .then(() => toast.success(MSG.toast.copied))
      .catch(() => toast.error(MSG.toast.copyFailed))
  }

  return (
    <section className={`${styles.block} ${styles.equalBlockSm}`}>
      <h2 className={`${styles.blockTitle} ${styles.blockHeadFixed}`}>Оренда залу</h2>

      <div className={styles.scrollBody}>
      {loading && <div className="loading-dots" role="status" aria-label="Завантаження..."><span /><span /><span /></div>}
      {error && <BlockError onRetry={refetch} />}

      {!loading && !error && byHall.length === 0 && (
        <div className={styles.empty}>Сьогодні студія без занять — оренду немає кому відкрити.</div>
      )}

      {!loading && !error && byHall.map(h => (
        <div key={h.hall} className={styles.slotRow}>
          <div className={styles.slotHallRow}>
            <span className={styles.slotHall}>{h.hall}</span>
            <button
              type="button"
              className={styles.slotCopyBtn}
              onClick={() => handleCopyHall(h.hall, h.free)}
              title="Скопіювати слоти"
              aria-label={`Скопіювати слоти залу ${h.hall}`}
            >
              <CopyIcon />
            </button>
          </div>
          <div className={styles.slotWindows}>
            {splitIntoHourSlots(h.free).map(w => (
              <span key={w.from} className={styles.slotChip}>
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
