'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRealtime } from '@/lib/useRealtime'
import { getClassById } from '@/lib/queries/classes'
import { listEnrollmentsForClass } from '@/lib/queries/enrollments'
import { listTrainingTypeLabels } from '@/lib/queries/training-types'
import { getActiveCount } from '@/lib/scheduleMetrics'
import type { Class } from '@/types'
import styles from './ScheduleDetailCard.module.css'

type ClassWithJoins = Class & {
  trainers: { name: string } | null
  halls: { name: string } | null
  enrollments: { id: string; status: string }[]
}

interface Props {
  classId: string
  onClose: () => void
  onEdit: () => void
}

const DAYS_FULL_UK = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пятниця', 'Субота']
const MONTHS_UK = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня']

export default function ScheduleDetailCard({ classId, onClose, onEdit }: Props) {
  const [cls, setCls] = useState<ClassWithJoins | null>(null)
  const [enrollmentCount, setEnrollmentCount] = useState(0)
  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const fetchClass = useCallback(async () => {
    const data = await getClassById(supabase, classId)
    if (data) {
      setCls(data as ClassWithJoins)
      const enrollments = await listEnrollmentsForClass(supabase, classId)
      setEnrollmentCount(getActiveCount(enrollments as any))
    }
    setLoading(false)
  }, [classId])

  useEffect(() => { fetchClass() }, [fetchClass])

  useRealtime(['classes', 'enrollments'], fetchClass)

  useEffect(() => {
    listTrainingTypeLabels(supabase).then(setTypeLabels)
  }, [])

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.skeleton}>Завантаження...</div>
      </div>
    )
  }

  if (!cls) {
    return (
      <div className={styles.card}>
        <div className={styles.skeleton}>Заняття не знайдено</div>
      </div>
    )
  }

  const startTime = new Date(cls.starts_at)
  const endTime = new Date(startTime.getTime() + cls.duration_min * 60000)

  const pad = (n: number) => String(n).padStart(2, '0')
  const timeStr = `${pad(startTime.getHours())}:${pad(startTime.getMinutes())} – ${pad(endTime.getHours())}:${pad(endTime.getMinutes())}`
  const dayOfWeek = DAYS_FULL_UK[startTime.getDay()]
  const fullDate = `${startTime.getDate()} ${MONTHS_UK[startTime.getMonth()]} ${startTime.getFullYear()}`
  const typeLabel = typeLabels[cls.ticket_type] ?? cls.ticket_type
  const title = cls.title || typeLabel

  function buildCopyText() {
    const lines = [title, `${dayOfWeek}, ${fullDate}`, timeStr]
    if (cls!.halls?.name) lines.push(cls!.halls.name)
    if (cls!.trainers?.name) lines.push(cls!.trainers.name)
    return lines.join('\n')
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildCopyText())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.title}>{title}</div>
        <div className={styles.actions}>
          <button
            className={styles.actionBtn}
            onClick={handleCopy}
            aria-label="Скопіювати деталі"
            title={copied ? 'Скопійовано!' : 'Копіювати'}
          >
            {copied ? (
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2.5 7.5l3.5 3.5 6.5-6.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="4" y="4" width="8" height="8" rx="1" />
                <path d="M3 10V3a1 1 0 0 1 1-1h7" strokeLinecap="round" />
              </svg>
            )}
          </button>
          <button
            className={styles.actionBtn}
            onClick={onEdit}
            aria-label="Редагувати заняття"
            title="Редагувати"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10.5 2.5l2 2L5 12H3v-2l7.5-7.5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className={styles.actionBtn} onClick={onClose} aria-label="Закрити">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l9 9M12 3l-9 9" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className={styles.rows}>
        <div className={styles.row}>
          <span className={styles.rowIcon}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" />
              <path d="M4.5 1v3M9.5 1v3M1.5 6.5h11" strokeLinecap="round" />
            </svg>
          </span>
          <span className={styles.rowText}>{dayOfWeek}, {fullDate}</span>
        </div>

        <div className={styles.row}>
          <span className={styles.rowIcon}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="7" cy="7" r="5.5" />
              <path d="M7 4v3.5l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className={styles.rowText}>{timeStr}</span>
        </div>

        {cls.halls && (
          <div className={styles.row}>
            <span className={styles.rowIcon}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M7 1.5C4.8 1.5 3 3.3 3 5.5c0 3.3 4 7 4 7s4-3.7 4-7c0-2.2-1.8-4-4-4z" />
                <circle cx="7" cy="5.5" r="1.5" />
              </svg>
            </span>
            <span className={styles.rowText}>{cls.halls.name}</span>
          </div>
        )}

        {cls.trainers && (
          <div className={styles.row}>
            <span className={styles.rowIcon}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                <circle cx="7" cy="4.5" r="2.5" />
                <path d="M1.5 12.5c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5" strokeLinecap="round" />
              </svg>
            </span>
            <span className={styles.rowText}>{cls.trainers.name}</span>
          </div>
        )}

        <div className={styles.row}>
          <span className={styles.rowIcon}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M2 3.5h10M2 7h6M2 10.5h8" strokeLinecap="round" />
            </svg>
          </span>
          <span className={styles.rowText}>Записано: {enrollmentCount}{cls.capacity ? ` / ${cls.capacity}` : ''}</span>
        </div>

        {cls.notes && (
          <div className={styles.row}>
            <span className={styles.rowIcon}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M2 2.5h10v7H8.5L6 12v-2.5H2z" />
              </svg>
            </span>
            <span className={styles.rowText}>{cls.notes}</span>
          </div>
        )}
      </div>

      <button className={styles.detailBtn} onClick={onEdit}>
        Докладніше →
      </button>
    </div>
  )
}
