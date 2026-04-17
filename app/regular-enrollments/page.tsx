'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import RegularEnrollmentModal from '@/components/RegularEnrollmentModal'
import type { RegularEnrollment } from '@/types'
import styles from './regular-enrollments.module.css'

const supabase = createClient()

export default function RegularEnrollmentsPage() {
  const [enrollments, setEnrollments] = useState<RegularEnrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editEnrollment, setEditEnrollment] = useState<RegularEnrollment | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const fetchEnrollments = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('regular_enrollments')
      .select(`
        id, valid_until, created_at,
        client_id,
        schedule_id,
        clients(id, first_name, last_name, phone),
        schedules(
          id, title, schedule_type, day_of_week, start_time,
          trainer_id, hall_id,
          trainers(name),
          halls(name)
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Fetch error:', error)
      setEnrollments([])
    } else {
      setEnrollments((data as unknown as RegularEnrollment[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchEnrollments()
  }, [fetchEnrollments])

  function clientName(e: RegularEnrollment): string {
    const { first_name, last_name } = e.clients
    return [first_name, last_name].filter(Boolean).join(' ') || '—'
  }

  function trainerName(e: RegularEnrollment): string {
    return e.schedules.trainers?.name || '—'
  }

  function hallName(e: RegularEnrollment): string {
    return e.schedules.halls?.name || '—'
  }

  function formatTime(time: string): string {
    // time format: "14:30:00"
    if (!time) return '—'
    return time.slice(0, 5) // "14:30"
  }

  function getDayName(day: number): string {
    const dayMap: Record<number, string> = {
      0: 'Нд',
      1: 'Пн',
      2: 'Вт',
      3: 'Ср',
      4: 'Чт',
      5: 'Пт',
      6: 'Сб',
    }
    return dayMap[day] || '?'
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—'
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
  }

  function isExpiringSoon(validUntil: string | null): boolean {
    if (!validUntil) return false
    const now = new Date()
    const expireDate = new Date(validUntil)
    const daysUntilExpire = Math.floor((expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysUntilExpire >= 0 && daysUntilExpire <= 7
  }

  function isExpired(validUntil: string | null): boolean {
    if (!validUntil) return false
    const now = new Date()
    const expireDate = new Date(validUntil)
    return expireDate.getTime() < now.getTime()
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    setDeleteError('')

    const { error: delError } = await supabase
      .from('regular_enrollments')
      .delete()
      .eq('id', deleteId)

    if (delError) {
      setDeleteError(delError.message)
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

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.title}>Постійники</h1>
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

        <div className={styles.content}>
          {loading ? (
            <div className={styles.empty}>Завантаження...</div>
          ) : enrollments.length === 0 ? (
            <div className={styles.empty}>Постійників ще немає</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Клієнт</th>
                    <th>Тренування</th>
                    <th>День</th>
                    <th>Час</th>
                    <th>Зал</th>
                    <th>Тренер</th>
                    <th>Дійсно до</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map(e => {
                    const expired = isExpired(e.valid_until as any)
                    const expiringSoon = isExpiringSoon(e.valid_until as any)

                    return (
                      <tr key={e.id}>
                        <td>{clientName(e)}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ fontWeight: 500 }}>{e.schedules.title}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                              {e.schedules.schedule_type}
                            </div>
                          </div>
                        </td>
                        <td>{getDayName(e.schedules.day_of_week)}</td>
                        <td>{formatTime(e.schedules.start_time)}</td>
                        <td className={styles.trainer}>{hallName(e)}</td>
                        <td className={styles.trainer}>{trainerName(e)}</td>
                        <td className={styles.validUntil}>
                          {e.valid_until === null ? (
                            <span className={styles.validUntilActive}>постійно</span>
                          ) : expired ? (
                            <span className={styles.validUntilExpired}>{formatDate(e.valid_until)}</span>
                          ) : expiringSoon ? (
                            <span className={styles.validUntilExpiring}>{formatDate(e.valid_until)}</span>
                          ) : (
                            <span className={styles.validUntilActive}>{formatDate(e.valid_until)}</span>
                          )}
                        </td>
                        <td>
                          <div className={styles.actions}>
                            <button
                              className={styles.btnEdit}
                              onClick={() => {
                                setEditEnrollment(e)
                                setShowModal(true)
                              }}
                            >
                              Змінити
                            </button>
                            <button
                              className={styles.btnDel}
                              onClick={() => setDeleteId(e.id)}
                            >
                              Видалити
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <RegularEnrollmentModal
          onClose={() => {
            setShowModal(false)
            setEditEnrollment(null)
          }}
          onSaved={handleSaved}
          editEnrollment={editEnrollment}
        />
      )}

      {deleteId && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <h3>Видалити постійника?</h3>
            <p>Цю дію неможливо скасувати.</p>
            {deleteError && <p className={styles.confirmError}>{deleteError}</p>}
            <div className={styles.confirmBtns}>
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
                className={styles.btnConfirmDel}
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
