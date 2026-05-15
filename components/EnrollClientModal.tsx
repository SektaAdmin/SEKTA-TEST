'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listClassesForDate, listEnrolledCountsForDate, listClientEnrolledClassIds, enrollClient } from '@/lib/queries/enrollments'
import { useModalFocus } from '@/hooks/useModalFocus'
import DatePicker from '@/components/DatePicker'
import type { Client } from '@/types'
import styles from './EnrollClientModal.module.css'


type ClassOption = {
  id: string
  ticket_type: string
  title: string | null
  starts_at: string
  duration_min: number
  capacity: number | null
  is_cancelled: boolean
  trainers: { name: string } | null
  halls: { name: string } | null
  enrolledCount: number
  alreadyEnrolled: boolean
}

interface Props {
  client: Client
  typeLabels: Record<string, string>
  onClose: () => void
  onSaved: () => void
}

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function pad(n: number) { return String(n).padStart(2, '0') }

function formatTime(iso: string, durationMin: number) {
  const start = new Date(iso)
  const end = new Date(start.getTime() + durationMin * 60000)
  return `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(end.getMinutes())}`
}

export default function EnrollClientModal({ client, typeLabels, onClose, onSaved }: Props) {
  const modalRef = useModalFocus(onClose)

  const [date, setDate] = useState(todayLocal())
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [loadingClasses, setLoadingClasses] = useState(false)
  const [enrollingId, setEnrollingId] = useState<string | null>(null)

  useEffect(() => {
    if (!date) return
    setLoadingClasses(true)

    listClassesForDate(supabase, date).then(async rawClasses => {
      const classIds = rawClasses.map(c => c.id)
      const [countMap, clientClassIds] = await Promise.all([
        listEnrolledCountsForDate(supabase, classIds),
        listClientEnrolledClassIds(supabase, client.id, classIds),
      ])
      setClasses(rawClasses.map(c => ({
        ...c,
        enrolledCount: countMap[c.id] ?? 0,
        alreadyEnrolled: clientClassIds.has(c.id),
      })))
      setLoadingClasses(false)
    })
  }, [date, client.id])

  async function handleEnroll(classId: string) {
    setEnrollingId(classId)
    const { error, isDuplicate } = await enrollClient(supabase, classId, client.id)
    if (error) {
      toast.error(isDuplicate ? 'Клієнт вже записаний на це заняття' : error)
      setEnrollingId(null)
      return
    }
    toast.success('Клієнта записано')
    onSaved()
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Записати на заняття"
      >
        <div className={styles.header}>
          <h2>Записати на заняття</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрити">✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.dateRange}>
            <span className={styles.dateLabel}>Дата</span>
            <DatePicker value={date} onChange={setDate} />
          </div>

          {loadingClasses ? (
            <div className={styles.empty}>Завантаження...</div>
          ) : classes.length === 0 ? (
            <div className={styles.empty}>Занять на цю дату немає</div>
          ) : (
            <div className={styles.list}>
              {classes.map(cls => {
                const isFull = cls.capacity != null && cls.enrolledCount >= cls.capacity
                const disabled = cls.alreadyEnrolled || isFull || enrollingId != null
                return (
                  <div key={cls.id} className={`${styles.item} ${cls.alreadyEnrolled ? styles.itemEnrolled : ''} ${isFull ? styles.itemFull : ''}`}>
                    <div className={styles.itemInfo}>
                      <span className={styles.itemTime}>{formatTime(cls.starts_at, cls.duration_min)}</span>
                      <span className={styles.itemType}>
                        {typeLabels[cls.ticket_type] ?? cls.ticket_type}
                        {cls.title ? ` · ${cls.title}` : ''}
                      </span>
                      <span className={styles.itemMeta}>
                        {cls.trainers?.name ?? '—'}
                        {cls.halls ? ` · ${cls.halls.name}` : ''}
                        {cls.capacity != null && (
                          <span className={isFull ? styles.full : styles.seats}>
                            {' · '}{cls.enrolledCount}/{cls.capacity}
                          </span>
                        )}
                      </span>
                    </div>
                    <button
                      className={styles.btnEnroll}
                      onClick={() => handleEnroll(cls.id)}
                      disabled={disabled}
                    >
                      {enrollingId === cls.id
                        ? '...'
                        : cls.alreadyEnrolled
                          ? 'Записаний'
                          : isFull
                            ? 'Немає місць'
                            : 'Записати'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
