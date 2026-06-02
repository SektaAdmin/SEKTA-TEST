'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { listClassesForDate, listEnrolledCountsForDate } from '@/lib/queries/enrollments'
import { useRefs } from '@/contexts/RefsContext'
import { useRealtime } from '@/lib/useRealtime'
import { formatTime } from '@/lib/formatters'
import styles from '../dashboard.module.css'

/* Блок: вільні місця на заняттях сьогодні (крім selftraining). */

type ClassRow = {
  id: string
  time: string
  title: string | null
  ticketType: string
  trainer: string | null
  hall: string | null
  capacity: number
  enrolled: number
  free: number
}

export function FreeSpacesBlock({ date }: { date: string }) {
  const { trainingTypes } = useRefs()
  const [rows, setRows] = useState<ClassRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)

    async function run() {
      const { data: classes, error: clsErr } = await listClassesForDate(supabase, date)
      if (cancelled) return
      if (clsErr) { setError(clsErr); setLoading(false); return }

      const filtered = classes.filter(c => c.ticket_type !== 'selftraining' && c.capacity != null && c.capacity > 0)
      if (filtered.length === 0) { setRows([]); setLoading(false); return }

      const ids = filtered.map(c => c.id)
      const { data: counts } = await listEnrolledCountsForDate(supabase, ids)
      if (cancelled) return

      const result: ClassRow[] = filtered
        .map(c => {
          const enrolled = counts[c.id] ?? 0
          const capacity = c.capacity!
          const free = Math.max(0, capacity - enrolled)
          return {
            id: c.id,
            time: formatTime(c.starts_at),
            title: c.title,
            ticketType: c.ticket_type,
            trainer: c.trainers?.name ?? null,
            hall: c.halls?.name ?? null,
            capacity,
            enrolled,
            free,
          }
        })
        .filter(r => r.free > 0)

      if (cancelled) return
      setRows(result)
      setLoading(false)
    }

    run()
    return () => { cancelled = true }
  }, [date])

  useEffect(() => { return load() }, [load])
  useRealtime(['classes', 'enrollments'], load)

  const typeLabel = useMemo(() => {
    const map: Record<string, string> = {}
    for (const t of trainingTypes) map[t.code] = t.label
    return map
  }, [trainingTypes])

  return (
    <section className={styles.spacesBlock}>
      <h2 className={styles.blockTitle}>Вільні місця на заняттях сьогодні</h2>

      {loading && <div className="loading-dots"><span /><span /><span /></div>}
      {error && <div className={styles.empty}>Помилка завантаження: {error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div className={styles.empty}>Занять немає</div>
      )}

      {!loading && !error && rows.length > 0 && (
        <table className={styles.spacesTable}>
          <thead>
            <tr>
              <th>Час</th>
              <th>Тип</th>
              <th>Тренер</th>
              <th>Зал</th>
              <th className={styles.spacesNumCol}>Вільно</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className={styles.spacesTime}>{r.time}</td>
                <td>{typeLabel[r.ticketType] ?? r.ticketType}</td>
                <td className={styles.spacesMuted}>{r.trainer ?? '—'}</td>
                <td className={styles.spacesMuted}>{r.hall ?? '—'}</td>
                <td className={styles.spacesNumCol}>
                  <span className={styles.spacesFreeOk}>{r.free}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
