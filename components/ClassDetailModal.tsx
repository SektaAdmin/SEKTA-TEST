'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useRealtime } from '@/lib/useRealtime'
import { useModalFocus } from '@/hooks/useModalFocus'
import { getClassById, updateClassCancelled, cancelClassAndRestoreSessions } from '@/lib/queries/classes'
import {
  listEnrollmentsForClass,
  listSessionBalancesForClients,
  getClientSessionBalance,
  markAttendance,
  updateEnrollmentStatus,
  reverseAttendance,
  checkClientConflict,
  enrollClient as enrollClientQuery,
} from '@/lib/queries/enrollments'
import { listTrainingTypeLabels } from '@/lib/queries/training-types'
import ClassModal from '@/components/ClassModal'
import ClientSearchCombobox from '@/components/features/ClientSearchCombobox'
import { CopyIcon } from '@/components/icons/navigation'
import { formatClientName, formatSaleDatetime } from '@/lib/formatters'
import { typeColor } from '@/lib/typeColor'
import { getActiveCount } from '@/lib/scheduleMetrics'
import { enrollmentStatusLabel, enrollmentStatusClass, enrollmentStatusIcon } from '@/lib/badges'
import type { Class, Client } from '@/types'
import styles from './ClassDetailModal.module.css'

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

interface Props {
  classId: string
  onClose: () => void
  onClassUpdated: () => void
}

export default function ClassDetailModal({ classId, onClose, onClassUpdated }: Props) {
  const modalRef = useModalFocus(onClose)

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
  const [confirmReverseId, setConfirmReverseId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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

  const isTwoHour = (c: ClassWithJoins | null) => (c?.duration_min ?? 0) >= 120

  async function handleEnroll() {
    if (!selectedClient || !cls || cls.ticket_type === 'self_training') return
    setEnrolling(true)
    setEnrollError(null)

    const already = enrollments.find(e => e.client_id === selectedClient.id)
    if (already) {
      setEnrollError('Клієнт вже записана на це заняття')
      setEnrolling(false)
      return
    }

    const conflict = await checkClientConflict(supabase, selectedClient.id, cls.id)
    if (conflict) {
      const when = new Date(conflict.starts_at).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })
      setEnrollError(`Клієнт вже записана на інше заняття о ${when}`)
      setEnrolling(false)
      return
    }

    const hoursArg = isTwoHour(cls) ? selectedHours.slice().sort() : undefined
    const { error, isDuplicate } = await enrollClientQuery(supabase, cls.id, selectedClient.id, hoursArg)
    if (error) {
      setEnrollError(isDuplicate ? 'Клієнт вже записана на це заняття' : 'Помилка при записі клієнта')
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
    const { restoredCount, error } = await cancelClassAndRestoreSessions(supabase, cls.id)
    if (error) {
      toast.error('Не вдалося скасувати заняття')
    } else {
      setConfirmCancelClass(false)
      if (restoredCount > 0) {
        toast.success(`Заняття скасовано. Повернено ${restoredCount} ${restoredCount === 1 ? 'заняття' : 'занять'} клієнтам`)
      }
      await loadAll()
      onClassUpdated()
    }
    setCancellingClass(false)
  }

  async function handleReverseAttendance(enrollmentId: string) {
    setActionLoading(enrollmentId)
    const { success, error } = await reverseAttendance(supabase, enrollmentId)
    if (!success) {
      toast.error(error ?? 'Не вдалося скасувати відвідування')
    } else if (cls) {
      await fetchEnrollments(cls.ticket_type)
    }
    setConfirmReverseId(null)
    setActionLoading(null)
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
      onClassUpdated()
    }
    setCancellingClass(false)
  }

  const activeCount = cls ? getActiveCount(enrollments) : 0
  const isFull = cls && cls.capacity != null && activeCount >= cls.capacity
  const fillPctValue = cls && cls.capacity != null ? Math.min((activeCount / cls.capacity) * 100, 100) : 0
  const waitlist = enrollments.filter(e => e.status === 'waitlist')
  const mainEnrollments = enrollments.filter(e => e.status !== 'waitlist')
  const stillEnrolled = enrollments.filter(e => e.status === 'enrolled')
  const classIsPast = cls ? new Date(cls.starts_at) < new Date() : false
  const startDate = cls ? new Date(cls.starts_at) : new Date()
  const endDate = cls ? new Date(startDate.getTime() + cls.duration_min * 60000) : new Date()
  const timeRange = `${formatTime(startDate)}–${formatTime(endDate)}`

  function buildCopyText() {
    if (!cls) return ''
    const label = cls.title || (typeLabels[cls.ticket_type] ?? cls.ticket_type)
    const titleLine = cls.halls?.name ? `${label} (${cls.halls.name})` : label
    const dateLine = new Date(cls.starts_at).toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(' р.', '').replace(/^./, c => c.toUpperCase())
    const dateTimeLine = `${dateLine}, ${timeRange}`
    const hours = cls.duration_min / 60
    const durationLine = hours % 1 !== 0
      ? `${cls.duration_min} хв`
      : hours === 1 ? '1 година' : hours === 2 ? '2 години' : `${hours} годин`
    const lines = [titleLine]
    if (cls.trainers?.name) lines.push(cls.trainers.name)
    lines.push(dateTimeLine, durationLine)
    return lines.join('\n')
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildCopyText())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="class-detail-title"
      >
        {/* Header */}
        <div className={styles.topbar}>
          <div className={styles.topbarRight}>
            {!loading && cls && (
              <button
                className={styles.btnCopy}
                onClick={handleCopy}
                title={copied ? 'Скопійовано!' : 'Копіювати'}
                aria-label="Копіювати деталі заняття"
                type="button"
              >
                {copied ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <polyline points="2 8 6 12 14 4"/>
                  </svg>
                ) : (
                  <CopyIcon />
                )}
              </button>
            )}
            <button className={styles.close} onClick={onClose} aria-label="Закрити">✕</button>
          </div>
        </div>

        <div className={styles.body}>
          {loading && (
            <div className={styles.loadingState}>Завантаження...</div>
          )}

          {!loading && (fetchError || !cls) && (
            <div className={styles.loadingState}>{fetchError ?? 'Заняття не знайдено'}</div>
          )}

          {!loading && cls && (
            <div className={styles.content}>
              {/* Callout */}
              {classIsPast && !cls.is_cancelled && stillEnrolled.length > 0 && (
                <div className={styles.callout}>
                  <span className={styles.calloutIcon}>⚠</span>
                  <span>
                    {stillEnrolled.length === 1
                      ? '1 клієнт не відмічена'
                      : `${stillEnrolled.length} клієнти не відмічені`}
                    {' '}&mdash; немає балансу або auto-close ще не спрацював.
                    Відмітьте вручну через ✓ / ✗ у таблиці нижче.
                  </span>
                </div>
              )}

              {/* Class details card */}
              <div className={styles.detailsCard}>
                <div className={styles.detailsHeadRow}>
                  <span id="class-detail-title" className={styles.detailsTitle}>
                    {cls.title || (typeLabels[cls.ticket_type] ?? cls.ticket_type)}
                  </span>
                  {cls.is_cancelled && (
                    <span className={`${styles.badge} ${styles.badgeNoshow} ${styles.cancelledBadge}`}>
                      скасовано
                    </span>
                  )}
                </div>

                <div className={styles.detailsDivider} />

                {(cls.trainers || cls.halls) ? (
                  <div className={styles.detailsGrid}>
                    <div className={styles.detailsCol}>
                      <span className={styles.detailsDate}>
                        {new Date(cls.starts_at).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).replace(' р.', '')}
                      </span>
                      <span className={styles.detailsTime}>{timeRange}</span>
                    </div>
                    <div className={styles.detailsCol}>
                      {cls.trainers && <span className={styles.detailsMeta}>{cls.trainers.name}</span>}
                      {cls.halls && <span className={styles.detailsMeta}>{cls.halls.name}</span>}
                    </div>
                  </div>
                ) : (
                  <div className={styles.detailsColSingle}>
                    <span className={styles.detailsDate}>
                      {new Date(cls.starts_at).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).replace(' р.', '')}
                    </span>
                    <span className={styles.detailsTime}>{timeRange}</span>
                  </div>
                )}

                <div className={styles.detailsDivider} />

                <div className={styles.capacityRow}>
                  <div className={styles.capacityLabel}>
                    <span>Місця</span>
                    <span className={styles.capacityCount}>
                      <strong>{activeCount}</strong>
                      {cls.capacity != null && <span> / {cls.capacity}</span>}
                    </span>
                  </div>
                  <div className={styles.capacityBar}>
                    <div
                      className={styles.capacityBarFill}
                      style={{
                        width: `${fillPctValue}%`,
                        backgroundColor: isFull ? 'var(--danger)' : 'var(--success)',
                      }}
                    />
                  </div>
                </div>

                {cls.notes && (
                  <>
                    <div className={styles.detailsDivider} />
                    <div className={styles.notesRow}>
                      <span className={styles.notesLabel}>Нотатки</span>
                      <span className={styles.notesValue}>{cls.notes}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Enrollment section */}
              <div className={styles.enrollmentSection}>
                <div className={styles.enrollmentHeader}>
                  <h2 className={styles.enrollmentTitle}>Записані клієнти</h2>
                  {!addingClient && cls?.ticket_type !== 'self_training' && (
                    <button className={styles.btnAdd} onClick={() => { setAddingClient(true); setEnrollError(null) }}>
                      + Записати
                    </button>
                  )}
                </div>

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
                              ? `${clientBalance} год.`
                              : 'Немає занять'}
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

                {mainEnrollments.length === 0 ? (
                  <div className={styles.empty}>Нікого не записано</div>
                ) : (
                  <div className={styles.tableContainer}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Клієнт</th>
                          <th>Статус</th>
                          <th className={styles.thRight}>Дія</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mainEnrollments.map(e => {
                          const name = e.clients
                            ? formatClientName(e.clients as { first_name: string | null; last_name: string | null })
                            : '—'
                          const isLoading = actionLoading === e.id
                          const hoursLabel = formatHoursLabel(e.hours_attended, cls.starts_at)
                          return (
                            <tr key={e.id} className={e.status === 'cancelled' ? styles.rowCancelled : ''}>
                              <td>
                                <a href={`/clients/${e.client_id}`} className={styles.clientLink}>
                                  {name}
                                </a>
                                {hoursLabel && <span className={styles.hoursTag}>{hoursLabel}</span>}
                              </td>
                              <td>
                                {(() => {
                                  const Icon = enrollmentStatusIcon(e.status)
                                  return (
                                    <span className={`${styles.badge} ${styles[enrollmentStatusClass(e.status)]}`}>
                                      {Icon && <Icon size={10} strokeWidth={2.5} style={{ flexShrink: 0 }} />}
                                      {enrollmentStatusLabel(e.status)}
                                    </span>
                                  )
                                })()}
                              </td>
                              <td className={styles.actionsCell}>
                                <div className={styles.actions}>
                                  {e.status === 'enrolled' && (
                                    <>
                                      <button
                                        className={styles.btnAttend}
                                        onClick={() => handleMarkAttended(e)}
                                        disabled={isLoading}
                                        title={enrollmentStatusLabel('attended')}
                                      >
                                        ✓
                                      </button>
                                      <button
                                        className={styles.btnNoshow}
                                        onClick={() => handleUpdateStatus(e.id, 'noshow')}
                                        disabled={isLoading}
                                        title={enrollmentStatusLabel('noshow')}
                                      >
                                        ✗
                                      </button>
                                      <button
                                        className={styles.btnCancelEnroll}
                                        onClick={() => handleUpdateStatus(e.id, 'cancelled')}
                                        disabled={isLoading}
                                        title={enrollmentStatusLabel('cancelled')}
                                      >
                                        —
                                      </button>
                                    </>
                                  )}
                                  {e.status === 'attended' && (
                                    confirmReverseId === e.id ? (
                                      <>
                                        <button
                                          className={styles.btnEdit}
                                          onClick={() => handleReverseAttendance(e.id)}
                                          disabled={isLoading}
                                        >
                                          Так
                                        </button>
                                        <button
                                          className={styles.btnCancelAdd}
                                          onClick={() => setConfirmReverseId(null)}
                                          disabled={isLoading}
                                        >
                                          Ні
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        className={styles.btnCancelEnroll}
                                        onClick={() => setConfirmReverseId(e.id)}
                                        disabled={isLoading}
                                        title={enrollmentStatusLabel('cancelled')}
                                      >
                                        —
                                      </button>
                                    )
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
                                      Вернути
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

                {waitlist.length > 0 && (
                  <div className={styles.waitlistSection}>
                    <h3 className={styles.waitlistTitle}>Черга ({waitlist.length})</h3>
                    <div className={styles.tableContainer}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Клієнт</th>
                            <th className={styles.thRight}>Дія</th>
                          </tr>
                        </thead>
                        <tbody>
                          {waitlist.map(e => {
                            const name = e.clients
                              ? formatClientName(e.clients as { first_name: string | null; last_name: string | null })
                              : '—'
                            const isLoading = actionLoading === e.id
                            return (
                              <tr key={e.id}>
                                <td>
                                  <a href={`/clients/${e.client_id}`} className={styles.clientLink}>
                                    {name}
                                  </a>
                                </td>
                                <td className={styles.actionsCell}>
                                  <div className={styles.actions}>
                                    <button
                                      className={styles.btnReEnroll}
                                      onClick={async () => {
                                        if (cls?.capacity != null && activeCount >= cls.capacity) {
                                          setActionError(prev => ({ ...prev, [e.id]: 'Зал заповнений — збільшіть кількість місць у редагуванні' }))
                                          return
                                        }
                                        setActionLoading(e.id)
                                        setActionError(prev => { const n = { ...prev }; delete n[e.id]; return n })
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

              {/* Footer actions */}
              <div className={styles.footerActions}>
                <button className={styles.btnEdit} onClick={() => setShowEditModal(true)}>
                  Редагувати
                </button>
                {cls.is_cancelled ? (
                  <button className={styles.btnRestore} onClick={handleRestoreClass} disabled={cancellingClass}>
                    Відновити
                  </button>
                ) : confirmCancelClass ? (
                  <>
                    <button className={styles.btnCancel} onClick={handleCancelClass} disabled={cancellingClass}>
                      Скасувати заняття
                    </button>
                    <button className={styles.btnEdit} onClick={() => setConfirmCancelClass(false)} disabled={cancellingClass}>
                      Скасувати
                    </button>
                  </>
                ) : (
                  <button className={styles.btnCancel} onClick={() => setConfirmCancelClass(true)}>
                    Скасувати заняття
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showEditModal && cls && (
        <ClassModal
          existing={cls}
          onClose={() => setShowEditModal(false)}
          onSaved={async () => { setShowEditModal(false); await loadAll(); onClassUpdated() }}
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
