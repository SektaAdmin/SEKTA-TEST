'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import RegularEnrollmentModal from '@/components/RegularEnrollmentModal'
import type { RegularEnrollment } from '@/types'
import styles from './regular-enrollments.module.css'

const supabase = createClient()

const DAYS = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота']

export default function RegularEnrollmentsPage() {
  const [allEnrollments, setAllEnrollments] = useState<RegularEnrollment[]>([])
  const [filteredEnrollments, setFilteredEnrollments] = useState<RegularEnrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editEnrollment, setEditEnrollment] = useState<RegularEnrollment | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Search and filter
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [selectedDay, setSelectedDay] = useState('all')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchEnrollments = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Get regular_enrollments
      const { data: enrollmentsData, error: enrollError } = await supabase
        .from('regular_enrollments')
        .select('id, valid_until, created_at, client_id, schedule_id')
        .order('created_at', { ascending: false })

      if (enrollError) throw enrollError

      if (!enrollmentsData || enrollmentsData.length === 0) {
        setAllEnrollments([])
        setFilteredEnrollments([])
        setLoading(false)
        return
      }

      // 2. Get all related clients
      const clientIds = [...new Set(enrollmentsData.map(e => e.client_id))]
      const { data: clientsData, error: clientError } = await supabase
        .from('clients')
        .select('id, first_name, last_name, phone')
        .in('id', clientIds)

      if (clientError) throw clientError

      // 3. Get all related schedules
      const scheduleIds = [...new Set(enrollmentsData.map(e => e.schedule_id))]
      const { data: schedulesData, error: scheduleError } = await supabase
        .from('schedules')
        .select('id, title, schedule_type, day_of_week, start_time, trainer_id, hall_id')
        .in('id', scheduleIds)

      if (scheduleError) throw scheduleError

      // 4. Get all related trainers
      const trainerIds = [...new Set(schedulesData?.map(s => s.trainer_id).filter(Boolean) || [])]
      const { data: trainersData, error: trainerError } = await supabase
        .from('trainers')
        .select('id, name')
        .in('id', trainerIds)

      if (trainerError) throw trainerError

      // 5. Get all related halls
      const hallIds = [...new Set(schedulesData?.map(s => s.hall_id).filter(Boolean) || [])]
      const { data: hallsData, error: hallError } = await supabase
        .from('halls')
        .select('id, name')
        .in('id', hallIds)

      if (hallError) throw hallError

      // 6. Create lookup maps
      const clientsMap = new Map(clientsData?.map(c => [c.id, c]) || [])
      const schedulesMap = new Map(schedulesData?.map(s => [s.id, s]) || [])
      const trainersMap = new Map(trainersData?.map(t => [t.id, t]) || [])
      const hallsMap = new Map(hallsData?.map(h => [h.id, h]) || [])

      // 7. Join data manually
      const enrichedEnrollments = enrollmentsData.map(enrollment => ({
        ...enrollment,
        clients: clientsMap.get(enrollment.client_id),
        schedules: {
          ...schedulesMap.get(enrollment.schedule_id),
          trainers: trainersMap.get(schedulesMap.get(enrollment.schedule_id)?.trainer_id),
          halls: hallsMap.get(schedulesMap.get(enrollment.schedule_id)?.hall_id),
        }
      }))

      setAllEnrollments(enrichedEnrollments as unknown as RegularEnrollment[])
    } catch (error) {
      console.error('Fetch error:', error)
      setAllEnrollments([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Apply filters and search
  useEffect(() => {
    let result = [...allEnrollments]

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(e => {
        const clientName = `${e.clients?.first_name || ''} ${e.clients?.last_name || ''}`.toLowerCase()
        return clientName.includes(q)
      })
    }

    // Filter by day
    if (selectedDay !== 'all') {
      result = result.filter(e => e.schedules?.day_of_week === parseInt(selectedDay))
    }

    // Sort by day, then time
    result.sort((a, b) => {
      const dayA = a.schedules?.day_of_week || 0
      const dayB = b.schedules?.day_of_week || 0
      if (dayA !== dayB) return dayA - dayB

      const timeA = a.schedules?.start_time || '00:00'
      const timeB = b.schedules?.start_time || '00:00'
      return timeA.localeCompare(timeB)
    })

    setFilteredEnrollments(result)
  }, [allEnrollments, search, selectedDay])

  useEffect(() => {
    fetchEnrollments()
  }, [fetchEnrollments])

  function handleSearchInput(value: string) {
    setSearchInput(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearch(value)
    }, 300)
  }

  function clientName(e: RegularEnrollment): string {
    const { first_name, last_name } = e.clients
    return [first_name, last_name].filter(Boolean).join(' ') || '—'
  }

  function trainerName(e: RegularEnrollment): string {
    return e.schedules?.trainers?.name || '—'
  }

  function hallName(e: RegularEnrollment): string {
    return e.schedules?.halls?.name || '—'
  }

  function formatTime(time: string): string {
    if (!time) return '—'
    return time.slice(0, 5)
  }

  // Group by day
  const groupedByDay = filteredEnrollments.reduce((acc, e) => {
    const day = e.schedules?.day_of_week || 0
    if (!acc[day]) acc[day] = []
    acc[day].push(e)
    return acc
  }, {} as Record<number, RegularEnrollment[]>)

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    setDeleteError('')

    const { error } = await supabase
      .from('regular_enrollments')
      .delete()
      .eq('id', deleteId)

    if (error) {
      setDeleteError(error.message)
      setDeleting(false)
      return
    }

    setDeleteId(null)
    setDeleting(false)
    fetchEnrollments()
  }

  function handleSaved() {
    setShowModal(false)
    setEditEnrollment(null)
    fetchEnrollments()
  }

  function handleEditClose() {
    setEditEnrollment(null)
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.title}>Постійники</h1>
          <div className={styles.topbarRight}>
            <div className={styles.searchWrap}>
              <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="7" cy="7" r="4.5"/>
                <line x1="10.5" y1="10.5" x2="14" y2="14"/>
              </svg>
              <input
                className={styles.searchInput}
                type="text"
                value={searchInput}
                onChange={e => handleSearchInput(e.target.value)}
                placeholder="Пошук по клієнту..."
                aria-label="Пошук постійника"
              />
            </div>
            <button 
              className={styles.btnNew} 
              onClick={() => {
                setEditEnrollment(null)
                setShowModal(true)
              }}
            >
              + Додати постійника
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className={styles.filters}>
          <button
            className={`${styles.filterBtn} ${selectedDay === 'all' ? styles.filterActive : ''}`}
            onClick={() => setSelectedDay('all')}
          >
            Всі дні
          </button>
          {DAYS.map((day, idx) => (
            <button
              key={idx}
              className={`${styles.filterBtn} ${selectedDay === idx.toString() ? styles.filterActive : ''}`}
              onClick={() => setSelectedDay(idx.toString())}
            >
              {day}
            </button>
          ))}
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.empty}>Завантаження...</div>
          ) : filteredEnrollments.length === 0 ? (
            <div className={styles.empty}>
              {search ? `За запитом «${search}» постійників не знайдено` : 'Постійників ще немає'}
            </div>
          ) : (
            <div className={styles.groupsWrap}>
              {Object.keys(groupedByDay).map(dayStr => {
                const day = parseInt(dayStr)
                const dayEnrollments = groupedByDay[day]

                return (
                  <div key={day} className={styles.dayGroup}>
                    <div className={styles.dayGroupHeader}>
                      <div className={styles.dayGroupTitle}>{DAYS[day]}</div>
                      <div className={styles.dayGroupCount}>{dayEnrollments.length}</div>
                    </div>

                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <tbody>
                          {dayEnrollments.map(e => (
                            <tr key={e.id}>
                              <td className={styles.name}>{clientName(e)}</td>
                              <td>{e.schedules?.title || '—'}</td>
                              <td className={styles.mono}>{formatTime(e.schedules?.start_time || '')}</td>
                              <td>{trainerName(e)}</td>
                              <td>{hallName(e)}</td>
                              <td className={styles.actionCell}>
                                <div className={styles.actionBtns}>
                                  <button
                                    className={styles.editBtn}
                                    onClick={() => {
                                      setEditEnrollment(e)
                                      setShowModal(true)
                                    }}
                                  >
                                    Змінити
                                  </button>
                                  <button
                                    className={styles.deleteBtn}
                                    onClick={() => setDeleteId(e.id)}
                                  >
                                    Видалити
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <RegularEnrollmentModal
          enrollment={editEnrollment}
          onClose={() => {
            setShowModal(false)
            handleEditClose()
          }}
          onSaved={handleSaved}
        />
      )}

      {deleteId && (
        <div className={styles.deleteOverlay}>
          <div className={styles.deleteModal}>
            <h3>Видалити постійника?</h3>
            <p>Цю дію неможливо скасувати.</p>
            {deleteError && <p className={styles.deleteError}>{deleteError}</p>}
            <div className={styles.deleteButtons}>
              <button
                className={styles.btnCancel}
                onClick={() => {
                  setDeleteId(null)
                  setDeleteError('')
                }}
              >
                Скасувати
              </button>
              <button
                className={styles.btnConfirmDelete}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Видалення...' : 'Видалити'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}