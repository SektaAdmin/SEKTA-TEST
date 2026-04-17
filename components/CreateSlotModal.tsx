'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import styles from './ScheduleModal.module.css'

interface Props {
  selectedDate: Date
  onClose: () => void
  onSaved: () => void
}

interface Hall {
  id: string
  name: string
  capacity: number
}

interface Trainer {
  id: string
  name: string
}

export default function CreateSlotModal({ selectedDate, onClose, onSaved }: Props) {
  const supabase = createClient()

  const [halls, setHalls] = useState<Hall[]>([])
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [loading, setLoading] = useState(true)

  const [startTime, setStartTime] = useState('10:00')
  const [duration, setDuration] = useState('60')
  const [hallId, setHallId] = useState('')
  const [trainerId, setTrainerId] = useState('')
  const [courseName, setCourseName] = useState('')
  const [courseType, setCourseType] = useState('group')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Завантажуємо дані при відкритті
  useState(() => {
    Promise.all([
      supabase.from('halls').select('id, name, capacity').eq('is_active', true).order('name'),
      supabase.from('trainers').select('id, name').eq('is_active', true).order('name'),
    ]).then(([hallsRes, trainersRes]) => {
      setHalls((hallsRes.data as Hall[]) ?? [])
      setTrainers((trainersRes.data as Trainer[]) ?? [])
      if ((hallsRes.data as Hall[])?.length > 0) {
        setHallId(((hallsRes.data as Hall[])[0]).id)
      }
      setLoading(false)
    })
  }, [])

  async function handleSubmit() {
    if (!courseName.trim()) {
      setError('Вкажіть назву тренування')
      return
    }
    if (!hallId) {
      setError('Оберіть зал')
      return
    }
    if (!startTime) {
      setError('Вкажіть час')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const slotDate = selectedDate.toISOString().split('T')[0]

      const { error: insertErr } = await supabase.from('schedule_slots').insert({
        slot_date: slotDate,
        start_time: startTime,
        hall_id: hallId,
        trainer_id: trainerId || null,
        course_name: courseName,
        course_type: courseType,
        is_cancelled: false,
        sessions_processed: false,
        capacity_override: null,
      })

      if (insertErr) {
        setError(insertErr.message)
        return
      }

      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={styles.modal}>
          <div className={styles.body}>Завантаження...</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            Нове тренування {selectedDate.toLocaleDateString('uk-UA')}
          </h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Закрити">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          {/* Назва */}
          <div className={styles.field}>
            <label className={styles.label}>Назва тренування *</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Pole Dance, Yoga, тощо"
              value={courseName}
              onChange={e => setCourseName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Час + тривалість */}
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Час початку *</label>
              <input
                className={styles.input}
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Тривалість (хв)</label>
              <input
                className={styles.input}
                type="number"
                min="15"
                step="5"
                value={duration}
                onChange={e => setDuration(e.target.value)}
              />
            </div>
          </div>

          {/* Зал + Тренер */}
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Зал *</label>
              <select
                className={styles.select}
                value={hallId}
                onChange={e => setHallId(e.target.value)}
              >
                <option value="">— оберіть зал —</option>
                {halls.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Тренер</label>
              <select
                className={styles.select}
                value={trainerId}
                onChange={e => setTrainerId(e.target.value)}
              >
                <option value="">— без тренера —</option>
                {trainers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Тип */}
          <div className={styles.field}>
            <label className={styles.label}>Тип</label>
            <select
              className={styles.select}
              value={courseType}
              onChange={e => setCourseType(e.target.value)}
            >
              <option value="group">Групове</option>
              <option value="individual">Індивідуальне</option>
              <option value="hallrental">Оренда залу</option>
            </select>
          </div>

          {error && <div className={styles.error}>{error}</div>}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose} disabled={saving}>
            Скасувати
          </button>
          <button className={styles.btnSave} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  )
}
