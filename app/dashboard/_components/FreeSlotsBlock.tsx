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

/** Вільні інтервали в межах робочого дня з урахуванням зайнятих. */
function computeFreeWindows(busy: HallBusyInterval[]): { from: number; to: number }[] {
  const sorted = [...busy].sort((a, b) => a.startMin - b.startMin)
  const free: { from: number; to: number }[] = []
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

function buildHallSlotsText(hallName: string, free: { from: number; to: number }[]): string {
  if (free.length === 0) return `${hallName}: повністю зайнятий`
  const slots = free.map(w => `${minToStr(w.from)}–${minToStr(w.to)}`).join(', ')
  return `${hallName}: ${slots}`
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
    const activeHalls = halls.filter(h => h.is_active)
    return activeHalls.map(h => {
      const hallBusy = busy.filter(b => b.hall === h.name)
      return { hall: h.name, free: computeFreeWindows(hallBusy) }
    })
  }, [halls, busy])

  function handleCopyHall(hallName: string, free: { from: number; to: number }[]) {
    const text = buildHallSlotsText(hallName, free)
    navigator.clipboard.writeText(text)
      .then(() => toast.success(MSG.toast.copied))
      .catch(() => toast.error(MSG.toast.copyFailed))
  }

  return (
    <section className={`${styles.block} ${styles.equalBlockSm}`}>
      <h2 className={`${styles.blockTitle} ${styles.blockHeadFixed}`}>Вільні слоти залів (8:00–22:00)</h2>

      <div className={styles.scrollBody}>
      {loading && <div className="loading-dots" role="status" aria-label="Завантаження..."><span /><span /><span /></div>}
      {error && <BlockError onRetry={refetch} />}

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
            {h.free.length === 0
              ? <span className={styles.slotFull}>Повністю зайнятий</span>
              : h.free.map(w => (
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
