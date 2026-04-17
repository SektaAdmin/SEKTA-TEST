'use client'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { RegularEnrollment } from '@/types'
import styles from './RegularEnrollmentModal.module.css'

interface RegularEnrollmentModalProps {
  onClose: () => void
  onSaved: () => void
  editEnrollment?: RegularEnrollment | null
}

type Client = {
  id: string
  first_name: string
  last_name: string
  phone: string
}

type Schedule = {
  id: string
  title: string
  schedule_type: string
  day_of_week: number
  start_time: string
  trainer_id: string
  hall_id: string
  trainers: { name: string }
  halls: { name: string }
}

export default function RegularEnrollmentModal({
  onClose,
  onSaved,
  editEnrollment,
}: RegularEnrollmentModalProps) {
  const supabase = createClient()
  const clientDropdownRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout>()

  const [clientId, setClientId] = useState('')
  const [clientName, setClientName] = useState('')
  const [trainerId, setTrainerId] = useState('all')
  const [dayOfWeek, setDayOfWeek] = useState('all')
  const [scheduleId, setScheduleId] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [schedulesLoading, setSchedulesLoading] = useState(true)
  const [searchClient, setSearchClient] = useState('')
  const [searchResults, setSearchResults] = useState<Client[]>([])
  const [searching, setSearching] = useState(false)
  const [showClientDropdown, setShowClientDropdown] = useState(false)

  // Загрузка расписаний при монтировании
  useEffect(() => {
    const loadSchedules = async () => {
      const { data } = await supabase
        .from('schedules')
        .select(`
          id, title, schedule_type, day_of_week, start_time,
          trainer_id, hall_id,
          trainers(name),
          halls(name)
        `)
        .eq('is_active', true)
        .order('day_of_week')
        .order('start_time')

      setSchedules((data as Schedule[]) ?? [])
      setSchedulesLoading(false)
    }

    loadSchedules()

    // Если редактируем, заполняем поля
    if (editEnrollment) {
      setClientId(editEnrollment.client_id)
      setClientName(`${editEnrollment.clients.first_name} ${editEnrollment.clients.last_name}`)
      setScheduleId(editEnrollment.schedule_id)
      setValidUntil(editEnrollment.valid_until ? editEnrollment.valid_until.toString().split('T')[0] : '')

      if (editEnrollment.schedules) {
        setTrainerId(editEnrollment.schedules.trainer_id)
        setDayOfWeek(editEnrollment.schedules.day_of_week.toString())
      }
    }
  }, [editEnrollment, supabase])

  // Live поиск по БД
  const handleSearchClient = useCallback(
    (query: string) => {
      setSearchClient(query)

      // Очистить предыдущий timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }

      if (!query.trim()) {
        setSearchResults([])
        return
      }

      setSearching(true)

      // Задержка 300ms для debounce
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const { data } = await supabase
            .from('clients')
            .select('id, first_name, last_name, phone')
            .or(
              `first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%`
            )
            .order('last_name')
            .limit(10)

          setSearchResults((data as Client[]) ?? [])
        } catch (err) {
          console.error('Search error:', err)
          setSearchResults([])
        } finally {
          setSearching(false)
        }
      }, 300)
    },
    [supabase]
  )

  // Закрытие dropdown при клике вне области
  useEffect(() => {
    if (!showClientDropdown) return

    const handleClickOutside = (e: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setShowClientDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showClientDropdown])

  // Одержуємо унікальні тренери
  const trainers = useMemo(() => {
    const uniqueTrainers = new Map<string, string>()
    schedules.forEach(s => {
      if (!uniqueTrainers.has(s.trainer_id)) {
        uniqueTrainers.set(s.trainer_id, s.trainers?.name || 'Невідомий тренер')
      }
    })
    return Array.from(uniqueTrainers.entries()).map(([id, name]) => ({ id, name }))
  }, [schedules])

  // Одержуємо унікальні дні
  const daysOfWeek = useMemo(() => {
    const uniqueDays = new Set(schedules.map(s => s.day_of_week))
    return Array.from(uniqueDays).sort((a, b) => a - b)
  }, [schedules])

  // Фільтруємо тренування за тренером і днем
  const filteredSchedules = useMemo(() => {
    let filtered = schedules

    if (trainerId !== 'all') {
      filtered = filtered.filter(s => s.trainer_id === trainerId)
    }

    if (dayOfWeek !== 'all') {
      filtered = filtered.filter(s => s.day_of_week === parseInt(dayOfWeek))
    }

    return filtered.sort((a, b) => {
      if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week
      return a.start_time.localeCompare(b.start_time)
    })
  }, [schedules, trainerId, dayOfWeek])

  // Вибір клієнта з dropdown
  const handleSelectClient = (client: Client) => {
    setClientId(client.id)
    setClientName(`${client.first_name} ${client.last_name}`)
    setSearchClient('')
    setSearchResults([])
    setShowClientDropdown(false)
  }

  async function handleSave() {
    setError('')

    if (!clientId || !scheduleId) {
      setError('Виберіть клієнта та тренування')
      return
    }

    setLoading(true)

    try {
      if (editEnrollment) {
        const { error: updateError } = await supabase
          .from('regular_enrollments')
          .update({
            client_id: clientId,
            schedule_id: scheduleId,
            valid_until: validUntil || null,
          })
          .eq('id', editEnrollment.id)

        if (updateError) {
          setError(updateError.message)
          setLoading(false)
          return
        }
      } else {
        const { error: insertError } = await supabase
          .from('regular_enrollments')
          .insert({
            client_id: clientId,
            schedule_id: scheduleId,
            valid_until: validUntil || null,
          })

        if (insertError) {
          setError(insertError.message)
          setLoading(false)
          return
        }
      }

      onSaved()
    } catch (err) {
      setError('Невідома помилка')
      setLoading(false)
    }
  }

  function getDayName(day: number): string {
    const dayMap: Record<number, string> = {
      0: 'Неділя',
      1: 'Понеділок',
      2: 'Вівторок',
      3: 'Середа',
      4: 'Четвер',
      5: "П'ятниця",
      6: 'Субота',
    }
    return dayMap[day] || '?'
  }

  function getScheduleLabel(schedule: Schedule): string {
    const trainerName = schedule.trainers?.name || '—'
    const hallName = schedule.halls?.name || '?'
    const time = schedule.start_time.slice(0, 5)
    return `${schedule.title} · ${trainerName} · ${hallName} · ${time}`
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>{editEnrollment ? 'Змінити постійника' : 'Додати постійника'}</h2>
          <button className={styles.close} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {error && <div className={styles.error}>{error}</div>}

          {/* КЛІЄНТ */}
          <div className={styles.field}>
            <label>
              Клієнт <span className={styles.required}>*</span>
            </label>
            <div className={styles.clientWrap} ref={clientDropdownRef}>
              <input
                type="text"
                placeholder="Пошук клієнта..."
                value={searchClient || clientName}
                onChange={e => handleSearchClient(e.target.value)}
                onFocus={() => setShowClientDropdown(true)}
              />
              {showClientDropdown && (
                <div className={styles.clientDropdown}>
                  {searching ? (
                    <div className={styles.clientEmpty}>Пошук...</div>
                  ) : searchResults.length === 0 ? (
                    <div className={styles.clientEmpty}>
                      {searchClient ? 'Клієнтів не знайдено' : 'Почніть вводити імя...'}
                    </div>
                  ) : (
                    searchResults.map(c => (
                      <div
                        key={c.id}
                        className={`${styles.clientOption} ${clientId === c.id ? styles.clientOptionActive : ''}`}
                        onClick={() => handleSelectClient(c)}
                      >
                        <div>
                          {c.first_name} {c.last_name}
                        </div>
                        {c.phone && <div className={styles.clientPhone}>{c.phone}</div>}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ФІЛЬТРИ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className={styles.field}>
              <label>Тренер</label>
              {schedulesLoading ? (
                <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>Завантаження...</div>
              ) : (
                <select value={trainerId} onChange={e => setTrainerId(e.target.value)}>
                  <option value="all">-- Усі --</option>
                  {trainers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className={styles.field}>
              <label>День</label>
              {schedulesLoading ? (
                <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>Завантаження...</div>
              ) : (
                <select value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)}>
                  <option value="all">-- Усі --</option>
                  {daysOfWeek.map(d => (
                    <option key={d} value={d}>
                      {getDayName(d)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* ТРЕНУВАННЯ */}
          <div className={styles.field}>
            <label>
              Тренування <span className={styles.required}>*</span>
              {filteredSchedules.length > 0 && (
                <span style={{ fontSize: '11px', color: 'var(--text-2)', fontWeight: '400', marginLeft: '6px' }}>
                  ({filteredSchedules.length})
                </span>
              )}
            </label>
            {schedulesLoading ? (
              <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>Завантаження...</div>
            ) : filteredSchedules.length === 0 ? (
              <div className={styles.error}>Немає тренувань з обраними фільтрами</div>
            ) : (
              <select
                value={scheduleId}
                onChange={e => setScheduleId(e.target.value)}
              >
                <option value="">-- Виберіть тренування --</option>
                {filteredSchedules.map(s => (
                  <option key={s.id} value={s.id}>
                    {getScheduleLabel(s)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* ДАТА */}
          <div className={styles.field}>
            <label>Дійсно до (опційно)</label>
            <input
              type="date"
              value={validUntil}
              onChange={e => setValidUntil(e.target.value)}
            />
            <div className={styles.depositHint}>Залиште порожнім для постійної записи</div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose} disabled={loading}>
            Скасувати
          </button>
          <button className={styles.btnSave} onClick={handleSave} disabled={loading || !scheduleId}>
            {loading ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  )
}
