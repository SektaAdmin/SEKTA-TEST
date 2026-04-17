'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import ScheduleModal from '@/components/ScheduleModal'
import type { Schedule, Hall, Trainer } from '@/types'
import styles from './schedules.module.css'

const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']

const supabase = createClient()

// Знаходить парне заняття по group_id серед усіх занять
function findPaired(s: Schedule, all: Schedule[]): Schedule | null {
  if (!s.group_id) return null
  return all.find(x => x.group_id === s.group_id && x.id !== s.id) ?? null
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [halls, setHalls] = useState<Hall[]>([])
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [filterDay, setFilterDay] = useState<number | 'all'>('all')
  const [filterHall, setFilterHall] = useState<string>('all')
  const [filterTrainer, setFilterTrainer] = useState<string>('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: schedulesData }, { data: hallsData }, { data: trainersData }] = await Promise.all([
      supabase
        .from('schedules')
        .select('id, title, schedule_type, trainer_id, hall_id, day_of_week, start_time, duration_minutes, max_capacity, reserve_slots, is_active, group_id, trainers(name), halls(name)')
        .order('start_time', { ascending: true })
        .order('day_of_week', { ascending: true }),
      supabase.from('halls').select('id, name').eq('is_active', true).order('name'),
      supabase.from('trainers').select('id, name').eq('is_active', true).order('name'),
    ])
    setSchedules((schedulesData as Schedule[]) ?? [])
    setHalls((hallsData as Hall[]) ?? [])
    setTrainers((trainersData as Trainer[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleToggle(id: string, newValue: boolean) {
    setToggling(id)
    await supabase.from('schedules').update({ is_active: newValue }).eq('id', id)
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, is_active: newValue } : s))
    setToggling(null)
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Видалити заняття "${title}"?\n\nЦю дію неможливо скасувати.`)) return
    setDeleting(id)
    await supabase.from('schedules').delete().eq('id', id)
    setSchedules(prev => prev.filter(s => s.id !== id))
    setDeleting(null)
  }

  function handleEdit(schedule: Schedule) {
    setEditingSchedule(schedule)
    setShowModal(true)
  }

  function handleCloseModal() {
    setShowModal(false)
    setEditingSchedule(null)
  }

  function handleSaved() {
    handleCloseModal()
    fetchData()
  }

  const active = schedules.filter(s => s.is_active)
  const archived = schedules.filter(s => !s.is_active)

  const filtered = active
    .filter(s => filterDay === 'all' || s.day_of_week === filterDay)
    .filter(s => filterHall === 'all' || s.hall_id === filterHall)
    .filter(s => filterTrainer === 'all' || s.trainer_id === filterTrainer)

  // Групування по часу (тільки коли обраний тренер)
  const groupByTime = filterTrainer !== 'all'
  const timeGroups: { time: string; rows: Schedule[] }[] = []

  if (groupByTime) {
    const map = new Map<string, Schedule[]>()
    filtered.forEach(s => {
      const t = s.start_time.slice(0, 5)
      if (!map.has(t)) map.set(t, [])
      map.get(t)!.push(s)
    })
    map.forEach((rows, time) => timeGroups.push({ time, rows }))
    timeGroups.sort((a, b) => a.time.localeCompare(b.time))
  }

  const selectedTrainerName = filterTrainer !== 'all'
    ? trainers.find(t => t.id === filterTrainer)?.name ?? ''
    : ''

  // Рядок таблиці — спільний для обох режимів
  function renderRow(s: Schedule, showTrainer = false, showTime = false) {
    const paired = findPaired(s, active)
    return (
      <tr key={s.id}>
        <td>
          <span className={styles.dayBadge}>
            {DAYS_SHORT[(s.day_of_week ?? 1) - 1]}
          </span>
        </td>
        {showTime && (
          <td className={styles.mono}>
            {s.start_time.slice(0, 5)}
            <span className={styles.duration}> · {s.duration_minutes}хв</span>
          </td>
        )}
        <td className={styles.name}>
          <span>{s.title}</span>
          {paired && (
            <span className={styles.pairedHint}>
              + {paired.start_time.slice(0, 5)}
            </span>
          )}
        </td>
        <td>
          <span className={styles.typeBadge}>{s.schedule_type}</span>
        </td>
        {showTrainer && (
          <td className={styles.secondary}>{(s.trainers as any)?.name ?? '—'}</td>
        )}
        <td className={styles.secondary}>{(s.halls as any)?.name ?? '—'}</td>
        <td className={styles.mono}>
          {s.max_capacity}
          {s.reserve_slots > 0 && <span className={styles.reserve}> +{s.reserve_slots}</span>}
        </td>
        <td>
          <div className={styles.toggleBtns}>
            <button
              className={`${styles.toggleBtn} ${styles.toggleTrue} ${s.is_active ? styles.toggleActiveTrue : ''}`}
              onClick={() => !s.is_active && handleToggle(s.id, true)}
              disabled={toggling === s.id || s.is_active}
            >TRUE</button>
            <button
              className={`${styles.toggleBtn} ${styles.toggleFalse} ${!s.is_active ? styles.toggleActiveFalse : ''}`}
              onClick={() => s.is_active && handleToggle(s.id, false)}
              disabled={toggling === s.id || !s.is_active}
            >FALSE</button>
          </div>
        </td>
        <td>
          <div className={styles.actionBtns}>
            <button className={styles.editBtn} onClick={() => handleEdit(s)}>Змінити</button>
            <button
              className={styles.deleteBtn}
              onClick={() => handleDelete(s.id, s.title)}
              disabled={deleting === s.id}
            >
              {deleting === s.id ? '...' : 'Видалити'}
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.title}>Розклад</h1>
          <button className={styles.btnNew} onClick={() => { setEditingSchedule(null); setShowModal(true) }}>
            + Додати заняття
          </button>
        </div>

        {/* Filters */}
        <div className={styles.filtersWrap}>
          <div className={styles.filters}>
            <button className={`${styles.filterBtn} ${filterTrainer === 'all' ? styles.filterActive : ''}`} onClick={() => setFilterTrainer('all')}>
              Всі тренери
            </button>
            {trainers.map(t => (
              <button key={t.id} className={`${styles.filterBtn} ${filterTrainer === t.id ? styles.filterActive : ''}`} onClick={() => setFilterTrainer(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
          <div className={styles.filters}>
            <button className={`${styles.filterBtn} ${filterDay === 'all' ? styles.filterActive : ''}`} onClick={() => setFilterDay('all')}>
              Всі дні
            </button>
            {DAYS_SHORT.map((d, i) => (
              <button key={i + 1} className={`${styles.filterBtn} ${filterDay === i + 1 ? styles.filterActive : ''}`} onClick={() => setFilterDay(i + 1)}>
                {d}
              </button>
            ))}
          </div>
          <div className={styles.filters}>
            <button className={`${styles.filterBtn} ${filterHall === 'all' ? styles.filterActive : ''}`} onClick={() => setFilterHall('all')}>
              Всі зали
            </button>
            {halls.map(h => (
              <button key={h.id} className={`${styles.filterBtn} ${filterHall === h.id ? styles.filterActive : ''}`} onClick={() => setFilterHall(h.id)}>
                {h.name}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.empty}>Завантаження...</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>Активних занять немає</div>
          ) : groupByTime ? (
            /* Режим тренера — групування по часу з підсвіткою парних занять */
            <div className={styles.groupsWrap}>
              {timeGroups.map(({ time, rows }) => (
                <div key={time} className={styles.timeGroup}>
                  <div className={styles.timeGroupHeader}>
                    <span className={styles.timeGroupTime}>{time}</span>
                    <span className={styles.timeGroupMeta}>
                      {selectedTrainerName} · {rows.length} {rows.length === 1 ? 'заняття' : 'занять'}
                    </span>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>День</th>
                          <th>Назва</th>
                          <th>Тип</th>
                          <th>Зал</th>
                          <th>Місць</th>
                          <th>Статус</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(s => renderRow(s, false, false))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Звичайна таблиця */
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>День</th>
                    <th>Час</th>
                    <th>Назва</th>
                    <th>Тип</th>
                    <th>Тренер</th>
                    <th>Зал</th>
                    <th>Місць</th>
                    <th>Статус</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => renderRow(s, true, true))}
                </tbody>
              </table>
            </div>
          )}

          {/* Archive */}
          <div className={styles.archiveSection}>
            <button className={styles.archiveToggle} onClick={() => setArchiveOpen(o => !o)} aria-expanded={archiveOpen}>
              <span className={`${styles.archiveChevron} ${archiveOpen ? styles.archiveChevronOpen : ''}`}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2.5 4.5l3.5 3.5 3.5-3.5"/>
                </svg>
              </span>
              Архів занять
              <span className={styles.archiveCount}>{archived.length}</span>
            </button>

            {archiveOpen && (
              archived.length === 0 ? (
                <div className={styles.archiveEmpty}>Архів порожній</div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>День</th>
                        <th>Час</th>
                        <th>Назва</th>
                        <th>Тренер</th>
                        <th>Зал</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {archived.map(s => (
                        <tr key={s.id} className={styles.archivedRow}>
                          <td><span className={styles.dayBadge}>{DAYS_SHORT[(s.day_of_week ?? 1) - 1]}</span></td>
                          <td className={styles.mono}>{s.start_time.slice(0, 5)}</td>
                          <td className={styles.name}>{s.title}</td>
                          <td className={styles.secondary}>{(s.trainers as any)?.name ?? '—'}</td>
                          <td className={styles.secondary}>{(s.halls as any)?.name ?? '—'}</td>
                          <td>
                            <div className={styles.actionBtns}>
                              <button className={styles.restoreBtn} onClick={() => handleToggle(s.id, true)} disabled={toggling === s.id}>
                                {toggling === s.id ? '...' : 'Відновити'}
                              </button>
                              <button className={styles.deleteBtn} onClick={() => handleDelete(s.id, s.title)} disabled={deleting === s.id}>
                                {deleting === s.id ? '...' : 'Видалити'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </div>
      </main>

      {showModal && (
        <ScheduleModal
          halls={halls}
          initialData={editingSchedule}
          onClose={handleCloseModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
