'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Schedule, Hall, Trainer } from '@/types'
import styles from './ScheduleModal.module.css'

const supabase = createClient()

interface Props {
  onClose: () => void
  onSaved: () => void
}

interface ScheduleWithDetails extends Schedule {
  halls?: Hall
  trainers?: Trainer
}

export default function ScheduleSlotsModal({ onClose, onSaved }: Props) {
  const [schedules, setSchedules] = useState<ScheduleWithDetails[]>([])
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    // Завантажуємо всі активні розклади
    supabase
      .from('schedules')
      .select('id, title, day_of_week, start_time, duration_minutes, trainer_id, hall_id')
      .eq('is_active', true)
      .order('day_of_week, start_time')
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message)
          return
        }
        setSchedules((data as ScheduleWithDetails[]) ?? [])
        if (data && data.length > 0) {
          setSelectedScheduleId(data[0].id)
        }
      })

    // Встановлюємо дефолтні дати (тиждень від сьогодні)
    const today = new Date()
    const monday = new Date(today)
    monday.setDate(today.getDate() - today.getDay() + 1)
    const nextMonday = new Date(monday)
    nextMonday.setDate(monday.getDate() + 7)

    setStartDate(monday.toISOString().split('T')[0])
    setEndDate(nextMonday.toISOString().split('T')[0])
  }, [])

  async function handleGenerateSlots() {
    if (!selectedScheduleId) {
      setError('Оберіть розклад')
      return
    }
    if (!startDate || !endDate) {
      setError('Вкажіть дати початку та кінця')
      return
    }

    const start = new Date(startDate)
    const end = new Date(endDate)

    if (start >= end) {
      setError('Дата кінця має бути пізніше за дату початку')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // Отримуємо обраний розклад
      const { data: schedule, error: scheduleErr } = await supabase
        .from('schedules')
        .select('*')
        .eq('id', selectedScheduleId)
        .single()

      if (scheduleErr || !schedule) {
        setError('Не вдалось завантажити розклад')
        return
      }

      // Генеруємо слоти для кожного дня в діапазоні
      const slots = []
      const current = new Date(start)

      while (current < end) {
        const dayOfWeek = current.getDay() === 0 ? 7 : current.getDay() // 1-7, Пн-Нд
        
        // Якщо день тижня збігається з розкладом
        if (dayOfWeek === schedule.day_of_week) {
          slots.push({
            schedule_id: schedule.id,
            hall_id: schedule.hall_id,
            trainer_id: schedule.trainer_id,
            slot_date: current.toISOString().split('T')[0],
            start_time: schedule.start_time,
            course_name: schedule.title,
            course_type: schedule.schedule_type,
            is_cancelled: false,
            sessions_processed: false,
            capacity_override: null,
          })
        }

        current.setDate(current.getDate() + 1)
      }

      if (slots.length === 0) {
        setError('Немає відповідних днів для цього розкладу в обраному діапазоні')
        setSaving(false)
        return
      }

      // Вставляємо слоти
      const { error: insertErr } = await supabase
        .from('schedule_slots')
        .insert(slots)

      if (insertErr) {
        setError(insertErr.message)
        setSaving(false)
        return
      }

      setSuccess(`✅ Створено ${slots.length} слотів`)
      setSelectedScheduleId('')
      setStartDate('')
      setEndDate('')
      
      setTimeout(() => {
        onSaved()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Невідома помилка')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Генерувати слоти розкладу</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Закрити">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.hint}>
            Виберіть розклад і діапазон дат, щоб автоматично створити слоти для всіх відповідних днів
          </div>

          {/* Schedule selection */}
          <div className={styles.field}>
            <label className={styles.label}>Розклад *</label>
            <select
              className={styles.select}
              value={selectedScheduleId}
              onChange={e => setSelectedScheduleId(e.target.value)}
              disabled={schedules.length === 0}
            >
              <option value="">— оберіть розклад —</option>
              {schedules.map(s => (
                <option key={s.id} value={s.id}>
                  {s.title} ({getDayName(s.day_of_week)}) {s.start_time}
                </option>
              ))}
            </select>
            {schedules.length === 0 && (
              <div className={styles.hint}>Немає активних розкладів. Спочатку створіть розклад.</div>
            )}
          </div>

          {/* Date range */}
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Дата початку *</label>
              <input
                className={styles.input}
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Дата кінця *</label>
              <input
                className={styles.input}
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {error && <div className={styles.error}>{error}</div>}
          {success && <div className={styles.success}>{success}</div>}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose} disabled={saving}>
            Скасувати
          </button>
          <button className={styles.btnSave} onClick={handleGenerateSlots} disabled={saving || !selectedScheduleId}>
            {saving ? 'Генерування...' : 'Генерувати слоти'}
          </button>
        </div>
      </div>
    </div>
  )
}

function getDayName(dayOfWeek: number): string {
  const days = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
  return days[dayOfWeek] || ''
}
