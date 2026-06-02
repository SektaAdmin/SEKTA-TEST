'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { listHallBusyIntervalsForDate, type HallBusyInterval } from '@/lib/queries/dashboard'
import { useRefs } from '@/contexts/RefsContext'
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

export function FreeSlotsBlock({ date }: { date: string }) {
  const { halls } = useRefs()
  const [busy, setBusy] = useState<HallBusyInterval[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listHallBusyIntervalsForDate(supabase, date).then(({ data, error }) => {
      if (cancelled) return
      setError(error)
      setBusy(data)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [date])

  const byHall = useMemo(() => {
    const activeHalls = halls.filter(h => h.is_active)
    return activeHalls.map(h => {
      const hallBusy = busy.filter(b => b.hall === h.name)
      return { hall: h.name, free: computeFreeWindows(hallBusy) }
    })
  }, [halls, busy])

  return (
    <section className={styles.slotsBlock}>
      <h2 className={styles.blockTitle}>Вільні слоти залів (8:00–22:00)</h2>

      {loading && <div className="loading-dots"><span /><span /><span /></div>}
      {error && <div className={styles.empty}>Помилка завантаження: {error}</div>}

      {!loading && !error && byHall.map((h, i) => (
        <div key={i} className={styles.slotRow}>
          <div className={styles.slotHall}>{h.hall}</div>
          <div className={styles.slotWindows}>
            {h.free.length === 0
              ? <span className={styles.slotFull}>Повністю зайнятий</span>
              : h.free.map((w, j) => (
                  <span key={j} className={styles.slotChip}>
                    {minToStr(w.from)}–{minToStr(w.to)}
                  </span>
                ))}
          </div>
        </div>
      ))}
    </section>
  )
}
