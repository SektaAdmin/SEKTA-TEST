'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useRealtime } from '@/lib/useRealtime'
import { getClassById, updateClassCancelled } from '@/lib/queries/classes'
import {
  listEnrollmentsForClass,
  listSessionBalancesForClients,
  getClientSessionBalance,
  markAttendance,
  updateEnrollmentStatus,
  checkClientConflict,
  enrollClient as enrollClientQuery,
} from '@/lib/queries/enrollments'
import { listTrainingTypeLabels } from '@/lib/queries/training-types'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import ClassModal from '@/components/ClassModal'
import ClientSearchCombobox from '@/components/features/ClientSearchCombobox'
import { formatClientName, formatSaleDatetime } from '@/lib/formatters'
import type { Class, Client } from '@/types'
import styles from './class-detail.module.css'


type ClassWithJoins = Class & {
  trainers: { name: string } | null
  halls: { name: string } | null
}

type EnrollmentRow = {
  id: string
  client_id: string
  status: 'enrolled' | 'attended' | 'cancelled' | 'noshow' | 'waitlist'
  sessions_used: number
  hours_attended: number[] | null
  created_at: string
  clients: { first_name: string | null; last_name: string | null } | null
}

const STATUS_LABELS: Record<string, string> = {
  enrolled:  'Записаний',
  attended:  'Відвідав',
  cancelled: 'Скасовано',
  noshow:    'Не прийшов',
  waitlist:  'Черга',
}

const STATUS_STYLES: Record<string, string> = {
  enrolled:  'badgeEnrolled',
  attended:  'badgeAttended',
  cancelled: 'badgeCancelled',
  noshow:    'badgeNoshow',
  waitlist:  'badgeWaitlist',
}

export default function ClassDetailClient({ classId }: { classId: string }) {
  const router = useRouter()

  const [cls, setCls] = useState<ClassWithJoins | null>(null)
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([])
  const [balanceMap, setBalanceMap] = useState<Record<string, number>>({})
  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [showEditModal, setShowEditModal] = useState(false)
  const [addingClient, setAddingClient] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientBalance, setClientBalance] = useState<number | null>(null)
  const [selectedHours, setSelectedHours] = useState<number[]>([1, 2])
  const [enrolling, setEnrolling] = useState(false)
  const [enrollError, setEnrollError] = useState<string | null>(null)

  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<Record<string, string>>({})
  const [cancellingClass, setCancellingClass] = useState(false)
  const [confirmCancelClass, setConfirmCancelClass] = useState(false)

  const fetchClass = useCallback(async () => {
    const data = await getClassById(supabase, classId)
    if (!data) { setFetchError('Заняття не знайдено'); return null }
    setCls(data as ClassWithJoins)
    return data as ClassWithJoins
  }, [classId])

  const fetchEnrollments = useCallback(async (ticketType: string) => {
    const rows = await listEnrollmentsForClass(supabase, classId)
    setEnrollments(rows as EnrollmentRow[])
    const clientIds = rows.map(e => e.client_id)
    const map = await listSessionBalancesForClients(supabase, clientIds, ticketType)
    setBalanceMap(map)
  }, [classId])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const clsData = await fetchClass()
    if (clsData) await fetchEnrollments(clsData.ticket_type)
    setLoading(false)
  }, [fetchClass, fetchEnrollments])

  useEffect(() => { loadAll() }, [loadAll])

  useRealtime(['classes', 'enrollments', 'client_session_balances'], loadAll)

  useEffect(() => {
    listTrainingTypeLabels(supabase).then(setTypeLabels)
  }, [])

  async function handleClientSelect(client: Client) {
    setSelectedClient(client)
    setEnrollError(null)
    if (!cls) return
    const balance = await getClientSessionBalance(supabase, client.id, cls.ticket_type)
    setClientBalance(balance)
  }

  const isTwoHour = (cls: ClassWithJoins | null) => (cls?.duration_min ?? 0) >= 120

  async function handleEnroll() {
    if (!selectedClient || !cls) return
    setEnrolling(true)
    setEnrollError(null)

    const already = enrollments.find(e => e.client_id === selectedClient.id)
    if (already) {
      setEnrollError('Клієнт вже записаний на це заняття')
      setEnrolling(false)
      return
    }

    const conflict = await checkClientConflict(supabase, selectedClient.id, cls.id)
    if (conflict) {
      const when = new Date(conflict.starts_at).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })
      setEnrollError(`Клієнт вже записаний на інше заняття о ${when}`)
      setEnrolling(false)
      return
    }

    const hoursArg = isTwoHour(cls) ? selectedHours.slice().sort() : undefined
    const { error, isDuplicate } = await enrollClientQuery(supabase, cls.id, selectedClient.id, hoursArg)
    if (error) {
      setEnrollError(isDuplicate ? 'Клієнт вже записаний на це заняття' : 'Помилка при записі клієнта')
      setEnrolling(false)
      return
    }
    setAddingClient(false)
    setSelectedClient(null)
    setClientBalance(null)
    setSelectedHours([1, 2])
    await fetchEnrollments(cls.ticket_type)
    setEnrolling(false)
  }

  async function handleMarkAttended(enrollment: EnrollmentRow) {
    setActionLoading(enrollment.id)
    setActionError(prev => { const n = { ...prev }; delete n[enrollment.id]; return n })
    const sessionsUsed = enrollment.hours_attended?.length ?? 1
    const { success, error } = await markAttendance(supabase, enrollment.id, sessionsUsed)
    if (!success) {
      setActionError(prev => ({ ...prev, [enrollment.id]: error ?? 'Помилка' }))
    } else if (cls) {
      await fetchEnrollments(cls.ticket_type)
    }
    setActionLoading(null)
  }

  async function handleUpdateStatus(enrollmentId: string, status: 'noshow' | 'cancelled') {
    setActionLoading(enrollmentId)
    const { error } = await updateEnrollmentStatus(supabase, enrollmentId, status)
    if (error) {
      toast.error('Не вдалося оновити статус')
    } else if (cls) {
      await fetchEnrollments(cls.ticket_type)
    }
    setActionLoading(null)
  }

  async function handleCancelClass() {
    if (!cls) return
    setCancellingClass(true)
    const { error } = await updateClassCancelled(supabase, cls.id, true)
    if (error) {
      toast.error('Не вдалося скасувати заняття')
    } else {
      setConfirmCancelClass(false)
      await fetchClass()
    }
    setCancellingClass(false)
  }

  async function handleRestoreClass() {
    if (!cls) return
    setCancellingClass(true)

    const { data: conflicts } = await supabase.rpc('check_class_conflicts', {
      p_starts_at: cls.starts_at,
      p_duration_min: cls.duration_min,
      p_hall_id: cls.hall_id ?? null,
      p_trainer_id: cls.trainer_id ?? null,
      p_exclude_id: cls.id,
    })
    if (conflicts && conflicts.length > 0) {
      const c = conflicts[0]
      const when = new Date(c.starts_at).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })
      const who = c.conflict_type === 'hall' ? 'Зал' : 'Тренер'
      const label = c.title || c.ticket_type
      toast.error(`${who} зайнятий — конфлікт із «${label}» о ${when}`)
      setCancellingClass(false)
      return
    }

    const { error } = await updateClassCancelled(supabase, cls.id, false)
    if (error) {
      toast.error('Не вдалося відновити заняття')
    } else {
      await fetchClass()
    }
    setCancellingClass(false)
  }

if (loading) {
    return (
      <div className={styles.layout}>
        <Sidebar />
        <BottomNav />
        <main className={styles.main}>
          <div className={styles.loadingState}>Завантаження...</div>
        </main>
      </div>
    )
  }

  if (fetchError || !cls) {
    return (
      <div className={styles.layout}>
        <Sidebar />
        <BottomNav />
        <main className={styles.main}>
          <div className={styles.loadingState}>{fetchError ?? 'Заняття не знайдено'}</div>
        </main>
      </div>
    )
  }

  const activeCount = enrollments.filter(e => e.status === 'enrolled' || e.status === 'attended').length
  const waitlist = enrollments.filter(e => e.status === 'waitlist')
  const mainEnrollments = enrollments.filter(e => e.status !== 'waitlist')
  const stillEnrolled = enrollments.filter(e => e.status === 'enrolled')
  const classIsPast = new Date(cls.starts_at) < new Date()
  const startDate = new Date(cls.starts_at)
  const endDate = new Date(startDate.getTime() + cls.duration_min * 60000)
  const timeRange = `${formatTime(startDate)}–${formatTime(endDate)}`

  return (
    <div className={styles.layout}>
      <Sidebar />
      <BottomNav />
      <main className={styles.main}>

        {/* Header */}
        <div className={styles.topbar}>
          <button className={styles.back} onClick={() => router.push('/schedule')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 2L4 7l5 5"/>
            </svg>
            Розклад
          </button>
          <div className={styles.topbarActions}>
            <button className={styles.btnEdit} onClick={() => setShowEditModal(true)}>
              Редагувати
            </button>
            {cls.is_cancelled ? (
              <button className={styles.btnRestore} onClick={handleRestoreClass} disabled={cancellingClass}>
                Відновити
              </button>
            ) : confirmCancelClass ? (
              <>
                <span className={styles.confirmPrompt}>Скасувати заняття?</span>
                <button className={styles.btnCancel} onClick={handleCancelClass} disabled={cancellingClass}>
                  Так
                </button>
                <button className={styles.btnEdit} onClick={() => setConfirmCancelClass(false)} disabled={cancellingClass}>
                  Ні
                </button>
              </>
            ) : (
              <button className={styles.btnCancel} onClick={() => setConfirmCancelClass(true)}>
                Скасувати заняття
              </button>
            )}
          </div>
        </div>

        <div className={styles.content}>
          {/* Callout: клієнти без балансу після auto-close */}
          {classIsPast && !cls.is_cancelled && stillEnrolled.length > 0 && (
            <div className={styles.callout}>
              <span className={styles.calloutIcon}>⚠</span>
              <span>
                {stillEnrolled.length === 1
                  ? '1 клієнт не відмічений'
                  : `${stillEnrolled.length} клієнти не відмічені`}
                {' '}&mdash; немає балансу або auto-close ще не спрацював.
                Відмітьте вручну через ✓ / ✗ у таблиці нижче.
              </span>
            </div>
          )}

          {/* Class info */}
          <div className={styles.infoCard}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Тип</span>
              <span className={styles.infoValue}>
                {typeLabels[cls.ticket_type] ?? cls.ticket_type}
                {cls.title ? ` · ${cls.title}` : ''}
              </span>
              {cls.is_cancelled && <span className={styles.cancelledBadge}>скасовано</span>}
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Дата</span>
              <span className={styles.infoValue}>{formatSaleDatetime(cls.starts_at)}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Час</span>
              <span className={styles.infoValue}>{timeRange} ({cls.duration_min} хв)</span>
            </div>
            {cls.trainers && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Тренер</span>
                <span className={styles.infoValue}>{cls.trainers.name}</span>
              </div>
            )}
            {cls.halls && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Зал</span>
                <span className={styles.infoValue}>{cls.halls.name}</span>
              </div>
            )}
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Записані</span>
              <span className={styles.infoValue}>
                {activeCount}{cls.capacity != null ? ` / ${cls.capacity}` : ''}
              </span>
            </div>
            {cls.notes && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Нотатки</span>
                <span className={styles.infoValue}>{cls.notes}</span>
              </div>
            )}
          </div>

          {/* Enrollment section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Записані клієнти</h2>
              {!addingClient && (
                <button className={styles.btnAdd} onClick={() => { setAddingClient(true); setEnrollError(null) }}>
                  + Записати клієнта
                </button>
              )}
            </div>

            {/* Add client form */}
            {addingClient && (
              <div className={styles.addForm}>
                <ClientSearchCombobox
                  inputId="enroll-client"
                  onSelect={handleClientSelect}
                  onClear={() => { setSelectedClient(null); setClientBalance(null) }}
                />
                {selectedClient && (
                  <div className={styles.clientPreview}>
                    <span className={styles.clientName}>{formatClientName(selectedClient)}</span>
                    {clientBalance != null && (
                      <span className={clientBalance > 0 ? styles.balanceOk : styles.balanceWarn}>
                        {clientBalance > 0
                          ? `${clientBalance} год. на балансі`
                          : 'Немає занять — потрібен абонемент'}
                      </span>
                    )}
                  </div>
                )}
                {isTwoHour(cls) && (
                  <div className={styles.hoursSelect}>
                    {[1, 2].map(hour => {
                      const d = new Date(new Date(cls.starts_at).getTime() + (hour - 1) * 60 * 60000)
                      return (
                        <label key={hour} className={styles.hoursLabel}>
                          <input
                            type="checkbox"
                            checked={selectedHours.includes(hour)}
                            onChange={e => setSelectedHours(prev =>
                              e.target.checked ? [...prev, hour].sort() : prev.filter(h => h !== hour)
                            )}
                          />
                          {formatTime(d)}
                        </label>
                      )
                    })}
                  </div>
                )}
                {enrollError && <p className={styles.enrollError}>{enrollError}</p>}
                <div className={styles.addFormActions}>
                  <button
                    className={styles.btnCancelAdd}
                    onClick={() => { setAddingClient(false); setSelectedClient(null); setClientBalance(null); setEnrollError(null) }}
                  >
                    Скасувати
                  </button>
                  <button
                    className={styles.btnConfirmEnroll}
                    onClick={handleEnroll}
                    disabled={!selectedClient || enrolling}
                  >
                    {enrolling ? 'Записую...' : 'Записати'}
                  </button>
                </div>
              </div>
            )}

            {/* Enrollments table */}
            {mainEnrollments.length === 0 ? (
              <div className={styles.empty}>Нікого не записано</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Клієнт</th>
                      <th>Статус</th>
                      <th>Баланс год.</th>
                      <th>Дата запису</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mainEnrollments.map(e => {
                      const name = e.clients
                        ? formatClientName(e.clients as { first_name: string | null; last_name: string | null })
                        : '—'
                      const bal = balanceMap[e.client_id]
                      const isLoading = actionLoading === e.id
                      const hoursLabel = formatHoursLabel(e.hours_attended, cls.starts_at)
                      return (
                        <tr key={e.id} className={e.status === 'cancelled' ? styles.rowCancelled : ''}>
                          <td>
                            <a href={`/clients/${e.client_id}`} className={styles.clientLink}>
                              {name}
                            </a>
                            {hoursLabel && (
                              <span className={styles.hoursTag}>{hoursLabel}</span>
                            )}
                          </td>
                          <td>
                            <span className={`${styles.badge} ${styles[STATUS_STYLES[e.status]]}`}>
                              {STATUS_LABELS[e.status]}
                            </span>
                          </td>
                          <td className={styles.balanceCell}>
                            {bal != null ? (
                              <span className={bal > 0 ? styles.balPos : styles.balZero}>{bal}</span>
                            ) : '—'}
                          </td>
                          <td className={styles.dateCell}>
                            {formatSaleDatetime(e.created_at)}
                          </td>
                          <td>
                            <div className={styles.actions}>
                              {e.status === 'enrolled' && (
                                <>
                                  <button
                                    className={styles.btnAttend}
                                    onClick={() => handleMarkAttended(e)}
                                    disabled={isLoading}
                                    title="Відвідав"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    className={styles.btnNoshow}
                                    onClick={() => handleUpdateStatus(e.id, 'noshow')}
                                    disabled={isLoading}
                                    title="Не прийшов"
                                  >
                                    ✗
                                  </button>
                                  <button
                                    className={styles.btnCancelEnroll}
                                    onClick={() => handleUpdateStatus(e.id, 'cancelled')}
                                    disabled={isLoading}
                                    title="Скасувати"
                                  >
                                    —
                                  </button>
                                </>
                              )}
                              {(e.status === 'cancelled' || e.status === 'noshow') && (
                                <button
                                  className={styles.btnReEnroll}
                                  onClick={async () => {
                                    setActionLoading(e.id)
                                    await supabase.from('enrollments').update({ status: 'enrolled' }).eq('id', e.id)
                                    if (cls) await fetchEnrollments(cls.ticket_type)
                                    setActionLoading(null)
                                  }}
                                  disabled={isLoading}
                                >
                                  Повернути
                                </button>
                              )}
                              {actionError[e.id] && (
                                <span className={styles.rowError}>{actionError[e.id]}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Waitlist */}
            {waitlist.length > 0 && (
              <div className={styles.waitlistSection}>
                <h3 className={styles.waitlistTitle}>Список очікування ({waitlist.length})</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Клієнт</th>
                        <th>Баланс год.</th>
                        <th>Дата запису</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {waitlist.map(e => {
                        const name = e.clients
                          ? formatClientName(e.clients as { first_name: string | null; last_name: string | null })
                          : '—'
                        const bal = balanceMap[e.client_id]
                        const isLoading = actionLoading === e.id
                        return (
                          <tr key={e.id}>
                            <td>
                              <a href={`/clients/${e.client_id}`} className={styles.clientLink}>
                                {name}
                              </a>
                            </td>
                            <td className={styles.balanceCell}>
                              {bal != null ? (
                                <span className={bal > 0 ? styles.balPos : styles.balZero}>{bal}</span>
                              ) : '—'}
                            </td>
                            <td className={styles.dateCell}>
                              {formatSaleDatetime(e.created_at)}
                            </td>
                            <td>
                              <div className={styles.actions}>
                                <button
                                  className={styles.btnReEnroll}
                                  onClick={async () => {
                                    setActionLoading(e.id)
                                    await supabase.from('enrollments').update({ status: 'enrolled' }).eq('id', e.id)
                                    if (cls) await fetchEnrollments(cls.ticket_type)
                                    setActionLoading(null)
                                  }}
                                  disabled={isLoading}
                                >
                                  Підтвердити
                                </button>
                                <button
                                  className={styles.btnCancelEnroll}
                                  onClick={() => handleUpdateStatus(e.id, 'cancelled')}
                                  disabled={isLoading}
                                  title="Скасувати"
                                >
                                  —
                                </button>
                                {actionError[e.id] && (
                                  <span className={styles.rowError}>{actionError[e.id]}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {showEditModal && (
        <ClassModal
          existing={cls}
          onClose={() => setShowEditModal(false)}
          onSaved={async () => { setShowEditModal(false); await loadAll() }}
        />
      )}
    </div>
  )
}

function formatTime(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatHoursLabel(hours: number[] | null, startsAt: string): string | null {
  if (!hours || hours.length === 0) return null
  const sorted = [...hours].sort()
  if (sorted.length >= 2) return null
  const d = new Date(new Date(startsAt).getTime() + (sorted[0] - 1) * 60 * 60000)
  return formatTime(d)
}
