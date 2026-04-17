'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Hall, Trainer, Schedule } from '@/types'
import styles from './ScheduleModal.module.css'

const supabase = createClient()

const DAYS = [
  { label: 'Понеділок', value: 1 },
  { label: 'Вівторок', value: 2 },
  { label: 'Середа', value: 3 },
  { label: 'Четвер', value: 4 },
  { label: 'П\'ятниця', value: 5 },
  { label: 'Субота', value: 6 },
  { label: 'Неділя', value: 7 },
]

const SCHEDULE_TYPES = [
  { value: 'group', label: 'Груповий' },
  { value: 'hallrental', label: 'Оренда залу' },
  { value: 'smallhallrental', label: 'Оренда малого залу' },
  { value: 'pylonrental', label: 'Оренда пілону' },
  { value: 'striprental', label: 'Оренда стрипу' },
]

interface Props {
  halls: Hall[]
  initialData?: Schedule | null
  onClose: () => void
  onSaved: () => void
}

export default function ScheduleModal({ halls, initialData, onClose, onSaved }: Props) {
  const isEdit = !!initialData
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [relatedSchedules, setRelatedSchedules] = useState<Schedule[]>([])

  const [title, setTitle] = useState(initialData?.title ?? '')
  const [scheduleType, setScheduleType] = useState(initialData?.schedule_type ?? 'group')
  const [trainerId, setTrainerId] = useState(initialData?.trainer_id ?? '')
  const [hallId, setHallId] = useState(initialData?.hall_id ?? halls[0]?.id ?? '')
  const [dayOfWeek, setDayOfWeek] = useState<number>(initialData?.day_of_week ?? 1)
  const [startTime, setStartTime] = useState(initialData?.start_time?.slice(0, 5) ?? '10:00')
  const [duration, setDuration] = useState(String(initialData?.duration_minutes ?? 60))
  const [maxCapacity, setMaxCapacity] = useState(String(initialData?.max_capacity ?? 10))
  const [reserveSlots, setReserveSlots] = useState(String(initialData?.reserve_slots ?? 0))

  // group_id логіка — спрощена
  const [isGrouped, setIsGrouped] = useState(!!initialData?.group_id)
  const [selectedGroupId, setSelectedGroupId] = useState<string>(initialData?.group_id ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('trainers')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setTrainers((data as Trainer[]) ?? [])
        if (!isEdit && data && data.length > 0 && !trainerId) {
          setTrainerId(data[0].id)
        }
      })
  }, [])

  // Підвантажуємо суміжні заняття при зміні тренера або дня
  useEffect(() => {
    if (!isGrouped || !trainerId || !dayOfWeek) {
      setRelatedSchedules([])
      return
    }
    supabase
      .from('schedules')
      .select('id, title, start_time, group_id')
      .eq('trainer_id', trainerId)
      .eq('day_of_week', dayOfWeek)
      .eq('is_active', true)
      .neq('id', initialData?.id ?? '00000000-0000-0000-0000-000000000000')
      .order('start_time')
      .then(({ data }) => {
        setRelatedSchedules((data as Schedule[]) ?? [])
        // Якщо редагуємо і вже є group_id — підставляємо вибране заняття
        if (isEdit && initialData?.group_id && data) {
          const paired = data.find(s => s.group_id === initialData.group_id)
          if (paired) setSelectedGroupId(paired.id)
        }
      })
  }, [isGrouped, trainerId, dayOfWeek])

  async function handleSubmit() {
    if (!title.trim()) return setError('Введіть назву заняття')
    if (!hallId) return setError('Оберіть зал')
    if (!startTime) return setError('Вкажіть час початку')
    if (!duration || Number(duration) <= 0) return setError('Вкажіть тривалість')
    if (!maxCapacity || Number(maxCapacity) <= 0) return setError('Вкажіть кількість місць')
    if (isGrouped && relatedSchedules.length > 0 && !selectedGroupId) {
      return setError('Оберіть заняття для зв\'язку')
    }

    setSaving(true)
    setError(null)

    let groupId: string | null = null

    if (isGrouped) {
      if (selectedGroupId) {
        // Зв'язуємо з обраним заняттям
        const linked = relatedSchedules.find(s => s.id === selectedGroupId)
        if (linked?.group_id) {
          groupId = linked.group_id
        } else {
          // Обране заняття ще без group_id — створюємо нову групу для обох
          groupId = crypto.randomUUID()
          await supabase.from('schedules').update({ group_id: groupId }).eq('id', selectedGroupId)
        }
      } else {
        // Немає суміжних занять — створюємо нову групу
        groupId = crypto.randomUUID()
      }
    }

    const payload = {
      title: title.trim(),
      schedule_type: scheduleType,
      trainer_id: trainerId || null,
      hall_id: hallId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      duration_minutes: Number(duration),
      sessions_cost: 1,
      max_capacity: Number(maxCapacity),
      reserve_slots: Number(reserveSlots) || 0,
      group_id: groupId,
    }

    const { error: dbError } = isEdit
      ? await supabase.from('schedules').update(payload).eq('id', initialData!.id)
      : await supabase.from('schedules').insert({ ...payload, is_active: true })

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    onSaved()
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {isEdit ? 'Редагувати заняття' : 'Нове заняття'}
          </h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Закрити">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          {/* Title */}
          <div className={styles.field}>
            <label className={styles.label}>Назва *</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Наприклад: Pole dance"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Type */}
          <div className={styles.field}>
            <label className={styles.label}>Тип *</label>
            <select
              className={styles.select}
              value={scheduleType}
              onChange={e => setScheduleType(e.target.value)}
            >
              {SCHEDULE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Row: trainer + hall */}
          <div className={styles.row2}>
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
            <div className={styles.field}>
              <label className={styles.label}>Зал *</label>
              <select
                className={styles.select}
                value={hallId}
                onChange={e => setHallId(e.target.value)}
              >
                {halls.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row: day + time */}
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>День тижня *</label>
              <select
                className={styles.select}
                value={dayOfWeek}
                onChange={e => setDayOfWeek(Number(e.target.value))}
              >
                {DAYS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Час початку *</label>
              <input
                className={styles.input}
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
              />
            </div>
          </div>

          {/* Duration + capacity */}
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Тривалість (хв) *</label>
              <input
                className={styles.input}
                type="number"
                min="15"
                step="5"
                placeholder="60"
                value={duration}
                onChange={e => setDuration(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Макс. місць *</label>
              <input
                className={styles.input}
                type="number"
                min="1"
                placeholder="15"
                value={maxCapacity}
                onChange={e => setMaxCapacity(e.target.value)}
              />
            </div>
          </div>

          {/* Reserve */}
          <div className={styles.field}>
            <label className={styles.label}>Місця в резерві</label>
            <input
              className={styles.input}
              type="number"
              min="0"
              placeholder="0"
              value={reserveSlots}
              onChange={e => setReserveSlots(e.target.value)}
            />
          </div>

          {/* Group toggle */}
          <div className={styles.groupToggleRow}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={isGrouped}
                onChange={e => {
                  setIsGrouped(e.target.checked)
                  if (!e.target.checked) setSelectedGroupId('')
                }}
              />
              Частина тривалого заняття
            </label>
          </div>

          {/* Group link — спрощено: тільки список */}
          {isGrouped && (
            <div className={styles.groupBlock}>
              {relatedSchedules.length === 0 ? (
                <div className={styles.hint}>
                  Немає інших занять цього тренера в цей день — буде створено нову групу автоматично
                </div>
              ) : (
                <div className={styles.field}>
                  <label className={styles.label}>Зв'язати з заняттям</label>
                  <select
                    className={styles.select}
                    value={selectedGroupId}
                    onChange={e => setSelectedGroupId(e.target.value)}
                  >
                    <option value="">— оберіть заняття —</option>
                    {relatedSchedules.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.start_time.slice(0, 5)} · {s.title}
                        {s.group_id ? ' 🔗' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose} disabled={saving}>
            Скасувати
          </button>
          <button className={styles.btnSave} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Збереження...' : isEdit ? 'Зберегти зміни' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  )
}
