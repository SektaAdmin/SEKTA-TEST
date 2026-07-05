'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { listClassesForDate, listEnrolledCountsForDate } from '@/lib/queries/enrollments'
import { useRefs } from '@/contexts/RefsContext'
import { useListQuery } from '@/hooks/useListQuery'
import { formatTime } from '@/lib/formatters'
import { ArrowRightIcon } from '@/components/icons/navigation'
import ClassDetailModal from '@/components/ClassDetailModal'
import { BlockError } from './BlockError'
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
  choreo: string | null
}

export function FreeSpacesBlock({ date }: { date: string }) {
  const { trainingTypes } = useRefs()
  const [detailClassId, setDetailClassId] = useState<string | null>(null)

  const { data: rows, loading, error, refetch } = useListQuery<ClassRow>(
    async () => {
      const { data: classes, error: clsErr } = await listClassesForDate(supabase, date)
      if (clsErr) return { data: [], error: clsErr }

      const filtered = classes.filter(c => c.ticket_type !== 'selftraining' && c.capacity != null && c.capacity > 0)
      if (filtered.length === 0) return { data: [], error: null }

      const ids = filtered.map(c => c.id)
      const { data: counts } = await listEnrolledCountsForDate(supabase, ids)

      const result = filtered
        .map(c => ({
          id: c.id,
          time: formatTime(c.starts_at),
          ticketType: c.ticket_type,
          trainer: c.trainers?.name ?? null,
          hall: c.halls?.name ?? null,
          capacity: c.capacity!,
          free: Math.max(0, c.capacity! - (counts[c.id] ?? 0)),
          choreo: c.choreo_stage,
        }))
        .filter(r => r.free > 0)

      return { data: result, error: null }
    },
    [date],
    { realtime: ['classes', 'enrollments'] }
  )

  useEffect(() => {
    if (error) console.error('[FreeSpacesBlock]', error)
  }, [error])

  const typeLabel = useMemo(() => {
    const map: Record<string, string> = {}
    for (const t of trainingTypes) map[t.code] = t.label
    return map
  }, [trainingTypes])

  return (
    <section className={styles.block} data-impeccable-wrap="FreeSpacesBlock">
      <div className={styles.cardHead}>
        <h2 className={styles.blockTitle}>Вільні місця на заняттях сьогодні</h2>
      </div>

      <div className={styles.opsScroll}>
      {loading && (
        <div role="status" aria-label="Завантаження...">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={styles.skeletonRow} aria-hidden="true">
              <div className={styles.skeletonInfo}>
                <div className={styles.skeletonLine} style={{ width: '52%' }} />
                <div className={styles.skeletonLine} style={{ width: '34%' }} />
              </div>
              <div className={`${styles.skeletonBone} ${styles.spacesSkelCount}`} />
            </div>
          ))}
        </div>
      )}
      {error && <BlockError onRetry={refetch} />}
      {!loading && !error && rows.length === 0 && (
        <div className={styles.empty}>Всі заняття заповнені</div>
      )}

      {!loading && !error && rows.map(r => {
        const type = typeLabel[r.ticketType] ?? r.ticketType
        const meta = [r.trainer, r.hall].filter(Boolean)
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => setDetailClassId(r.id)}
            className={styles.spacesRow}
            aria-label={`${r.time} ${type}, вільних місць: ${r.free}. Відкрити заняття`}
          >
            <div className={styles.spacesInfo}>
              <div className={styles.spacesMain}>
                <span className={styles.spacesTime}>{r.time}</span>
                <span className={styles.spacesType}>{type}</span>
              </div>
              {meta.length > 0 && (
                <div className={styles.metaInline}>
                  {meta.map((m, i) => (
                    <span key={i}>
                      {i > 0 && <span className={styles.metaDot}>·</span>}
                      {m}
                    </span>
                  ))}
                </div>
              )}
              {r.choreo && <div className={styles.spacesChoreo}>{r.choreo}</div>}
            </div>
            <div className={styles.spacesRight}>
              <span className={styles.geistBadge}>{r.free}</span>
              <ArrowRightIcon className={styles.spacesChevron} />
            </div>
          </button>
        )
      })}
      </div>

      {detailClassId && (
        <ClassDetailModal
          classId={detailClassId}
          onClose={() => setDetailClassId(null)}
          onClassUpdated={refetch}
        />
      )}
    </section>
  )
}
