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

export default function ScheduleDetailCard({ classId, onClose, onEdit }: Props) {
  const [cls, setCls] = useState<ClassWithJoins | null>(null)
  const [enrollmentCount, setEnrollmentCount] = useState(0)
  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

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
  const timeStr = `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}–${String(endTime.getHours()).padStart(2, '0')}:${String(endTime.getMinutes()).padStart(2, '0')}`
  const DAYS_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  const dateStr = `${DAYS_SHORT[startTime.getDay()]}, ${String(startTime.getDate()).padStart(2, '0')}.${String(startTime.getMonth() + 1).padStart(2, '0')}.${startTime.getFullYear()}`
  const typeLabel = typeLabels[cls.ticket_type] ?? cls.ticket_type

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.title}>{cls.title || typeLabel}</div>
        <div className={styles.headerBtns}>
          <button className={styles.editBtn} onClick={onEdit} aria-label="Редагувати">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z"/>
            </svg>
          </button>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Закрити">
            ×
          </button>
        </div>
      </div>

      <div className={styles.rows}>
        <div className={styles.row}>
          <span className={styles.label}>Тип</span>
          <span className={styles.value}>{typeLabel}</span>
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Дата/Час</span>
          <span className={styles.value}>{dateStr} {timeStr}</span>
        </div>

        {cls.trainers && (
          <div className={styles.row}>
            <span className={styles.label}>Тренер</span>
            <span className={styles.value}>{cls.trainers.name}</span>
          </div>
        )}

        {cls.halls && (
          <div className={styles.row}>
            <span className={styles.label}>Зал</span>
            <span className={styles.value}>{cls.halls.name}</span>
          </div>
        )}

        <div className={styles.row}>
          <span className={styles.label}>Записано</span>
          <span className={styles.value}>{enrollmentCount}</span>
        </div>

        {cls.notes && (
          <div className={styles.row}>
            <span className={styles.label}>Нотатки</span>
            <span className={styles.value}>{cls.notes}</span>
          </div>
        )}
      </div>

      <button className={styles.detailBtn} onClick={onEdit}>
        Докладніше →
      </button>
    </div>
  )
}
