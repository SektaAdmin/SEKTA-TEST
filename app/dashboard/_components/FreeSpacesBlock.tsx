'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
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
  ticketType: string
  trainer: string | null
  hall: string | null
  capacity: number
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

      const result = filtered
        .map(c => ({
          id: c.id,
          time: formatTime(c.starts_at),
          ticketType: c.ticket_type,
          trainer: c.trainers?.name ?? null,
          hall: c.halls?.name ?? null,
          capacity: c.capacity!,
          free: Math.max(0, c.capacity! - (counts[c.id] ?? 0)),
        }))
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
        <div className={styles.empty}>Всі заняття заповнені</div>
      )}

      {!loading && !error && rows.map(r => (
        <div key={r.id} className={styles.spacesRow}>
          <div className={styles.spacesInfo}>
            <div className={styles.spacesMain}>
              <span className={styles.spacesTime}>{r.time}</span>
              <span className={styles.spacesType}>{typeLabel[r.ticketType] ?? r.ticketType}</span>
            </div>
            <div className={styles.spacesSub}>
              {[r.trainer, r.hall].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className={styles.spacesRight}>
            <span className={styles.spacesFreeChip}>{r.free}</span>
            <Link href={`/schedule/${r.id}`} className={styles.spacesLink} title="Відкрити заняття">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>
        </div>
      ))}
    </section>
  )
}
