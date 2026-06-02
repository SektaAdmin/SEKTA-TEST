'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listHallBusyIntervalsForDate, type HallBusyInterval } from '@/lib/queries/dashboard'
import { useRefs } from '@/contexts/RefsContext'
import { useRealtime } from '@/lib/useRealtime'
import { CopyIcon } from '@/components/icons/navigation'
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
  const [busy, setBusy] = useState<HallBusyInterval[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
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

  useEffect(() => { return load() }, [load])
  useRealtime(['classes'], load)

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
      .then(() => toast.success('Скопійовано'))
      .catch(() => toast.error('Не вдалося скопіювати'))
  }

  return (
    <section className={styles.block}>
      <h2 className={styles.blockTitle}>Вільні слоти залів (8:00–22:00)</h2>

      {loading && <div className="loading-dots"><span /><span /><span /></div>}
      {error && <div className={styles.empty}>Помилка завантаження: {error}</div>}

      {!loading && !error && byHall.map((h, i) => (
        <div key={i} className={styles.slotRow}>
          <div className={styles.slotHallRow}>
            <span className={styles.slotHall}>{h.hall}</span>
            <button
              className={styles.slotCopyBtn}
              onClick={() => handleCopyHall(h.hall, h.free)}
              title="Скопіювати слоти"
            >
              <CopyIcon />
            </button>
          </div>
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
