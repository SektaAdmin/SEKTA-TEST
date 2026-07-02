'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useRealtime } from '@/lib/useRealtime'
import { ModalShell } from '@/components/ui/ModalShell'
import { getClassById, updateClassCancelled, cancelClassAndRestoreSessions, restoreClass, deleteClass, updateClassChoreoStage, checkClassConflicts } from '@/lib/queries/classes'
import {
  listEnrollmentsForClass,
  getSessionBalancesAfter,
  changeEnrollmentStatus,
  checkClientConflict,
  deleteEnrollment,
  enrollClient as enrollClientQuery,
} from '@/lib/queries/enrollments'
import { listTrainingTypeLabels } from '@/lib/queries/training-types'
import ClassModal from '@/components/ClassModal'
import ClientSearchCombobox from '@/components/features/ClientSearchCombobox'
import { CopyButton } from '@/components/ui/CopyButton'
import { formatClientName, formatSaleDatetime } from '@/lib/formatters'
import { typeColor } from '@/lib/typeColor'
import { getActiveCount } from '@/lib/scheduleMetrics'
import { enrollmentStatusLabel, enrollmentStatusIcon, enrollmentBadge, enrollmentBadgeClass, cancelSourceSuffix, balanceClass } from '@/lib/badges'
import type { Class, Client } from '@/types'
import { ActionSelect } from '@/components/ui/ActionSelect'
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
  cancellation_source: string | null
  clients: { first_name: string | null; last_name: string | null } | null
}

interface Props {
  classId: string
  onClose: () => void
  onClassUpdated: () => void
  /** ID тренера що переглядає модалку (передавати коли роль = trainer) */
  viewerTrainerId?: string
  /** true для owner/admin; якщо false і viewerTrainerId не збігається з trainer_id — read-only */
  isStaff?: boolean
}

export default function ClassDetailModal({ classId, onClose, onClassUpdated, viewerTrainerId, isStaff = true }: Props) {

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
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingClass, setDeletingClass] = useState(false)
  const [confirmReverseId, setConfirmReverseId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const [choreoDraft, setChoreoDraft] = useState('')
  const [savingChoreo, setSavingChoreo] = useState(false)
  // Через ref, щоб guard читав свіже значення чернетки без перестворення fetchClass
  // (інакше кожна буква → новий loadAll → useEffect → перезавантаження модалки).
  const choreoDraftRef = useRef('')
  useEffect(() => { choreoDraftRef.current = choreoDraft }, [choreoDraft])

  // true = глядач може редагувати (staff або тренер цього заняття)
  const canManage = isStaff || (!!viewerTrainerId && !!cls && cls.trainer_id === viewerTrainerId)

  const fetchClass = useCallback(async () => {
    const { data } = await getClassById(supabase, classId)
    if (!data) { setFetchError('Заняття не знайдено'); return null }
    const next = data as ClassWithJoins
    setCls(prev => {
      // не перетирати чернетку, якщо адмін зараз редагує (realtime-тік)
      const dirty = prev != null && choreoDraftRef.current !== (prev.choreo_stage ?? '')
      if (!dirty) setChoreoDraft(next.choreo_stage ?? '')
      return next
    })
    return next
  }, [classId])

  const fetchEnrollments = useCallback(async (ticketType: string, startsAt: string) => {
    const { data: rows } = await listEnrollmentsForClass(supabase, classId)
    setEnrollments(rows as EnrollmentRow[])
    const clientIds = rows.map(e => e.client_id)
    const { data: map } = await getSessionBalancesAfter(supabase, clientIds, ticketType, startsAt)
    setBalanceMap(map)
  }, [classId])

  // showSpinner=true лише для першого завантаження; refetch (realtime/після дії)
  // оновлює дані без setLoading, щоб модалка не моргала скелетом.
  const loadAll = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    setFetchError(null)
    const clsData = await fetchClass()
    if (clsData) await fetchEnrollments(clsData.ticket_type, clsData.starts_at)
    if (showSpinner) setLoading(false)
  }, [fetchClass, fetchEnrollments])

  useEffect(() => { loadAll(true) }, [loadAll])

  useRealtime(['classes', 'enrollments', 'client_session_balances'], loadAll)

  useEffect(() => {
    listTrainingTypeLabels(supabase).then(r => setTypeLabels(r.data))
  }, [])

  async function handleClientSelect(client: Client) {
    setSelectedClient(client)
    setEnrollError(null)
    if (!cls) return
    // Баланс, з яким клієнт ВХОДИТЬ у це заняття — з урахуванням усіх його вже
    // наявних записів того ж типу до цього моменту (get_session_balance_after на
    // starts_at). Клієнт ще не записаний сюди, тож вартість цього заняття RPC не
    // враховує — її віднімаємо в прев'ю. Узгоджено з кабінетом клієнта.
    const { data: map } = await getSessionBalancesAfter(supabase, [client.id], cls.ticket_type, cls.starts_at)
    setClientBalance(map[client.id] ?? 0)
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

    const { data: conflict } = await checkClientConflict(supabase, selectedClient.id, cls.id)
    if (conflict) {
      const when = new Date(conflict.starts_at).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })
      setEnrollError(`Клієнт вже записана на інше заняття о ${when}`)
      setEnrolling(false)
      return
    }

    const hoursArg = isTwoHour(cls) ? selectedHours.slice().sort() : undefined
    const { error, isDuplicate, closeError } = await enrollClientQuery(supabase, cls.id, selectedClient.id, hoursArg)
    if (error) {
      setEnrollError(isDuplicate ? 'Клієнт вже записана на це заняття' : 'Помилка при записі клієнта')
      setEnrolling(false)
      return
    }
    // Запис у вже-минуле заняття → одразу attended. Якщо закриття не вдалось — cron підхопить.
    if (closeError) toast.warning(`Записано, але відвідування не зафіксовано: ${closeError}`)
    setAddingClient(false)
    setSelectedClient(null)
    setClientBalance(null)
    setSelectedHours([1, 2])
    await fetchEnrollments(cls.ticket_type, cls.starts_at)
    setEnrolling(false)
  }

  // Єдина точка зміни статусу — через RPC, що тримає інваріант балансу сесій
  // і застосовує правило скасування у часових рамках (штраф/без штрафу).
  async function handleStatusChange(
    enrollment: EnrollmentRow,
    status: 'enrolled' | 'attended' | 'noshow' | 'cancelled',
    opts?: { forceNoCharge?: boolean },
  ) {
    setActionLoading(enrollment.id)
    setActionError(prev => { const n = { ...prev }; delete n[enrollment.id]; return n })
    const sessionsUsed = status === 'attended' ? (enrollment.hours_attended?.length ?? 1) : undefined
    const { success, charged, error } = await changeEnrollmentStatus(supabase, enrollment.id, status, {
      forceNoCharge: opts?.forceNoCharge,
      sessionsUsed,
    })
    if (!success) {
      setActionError(prev => ({ ...prev, [enrollment.id]: error ?? 'Помилка' }))
    } else {
      if (status === 'cancelled') {
        toast.success(charged ? 'Скасовано — заняття списано (несвоєчасно)' : 'Скасовано без списання')
      }
      if (cls) await fetchEnrollments(cls.ticket_type, cls.starts_at)
    }
    setActionLoading(null)
  }

  async function handleSaveChoreo() {
    if (!cls) return
    setSavingChoreo(true)
    const value = choreoDraft.trim() || null
    const { error } = await updateClassChoreoStage(supabase, cls.id, value)
    if (error) {
      toast.error('Не вдалося зберегти етап хореографії')
    } else {
      setCls({ ...cls, choreo_stage: value })
      toast.success('Етап хореографії збережено')
    }
    setSavingChoreo(false)
  }

  async function handleCancelClass() {
    if (!cls) return
    setCancellingClass(true)
    const { restoredCount, error } = await cancelClassAndRestoreSessions(supabase, cls.id)
    if (error) {
      toast.error('Не вдалося скасувати заняття')
    } else {
      setShowCancelConfirm(false)
      if (restoredCount > 0) {
        toast.success(`Заняття скасовано. Повернено ${restoredCount} ${restoredCount === 1 ? 'заняття' : 'занять'} клієнтам`)
      } else {
        toast.success('Заняття скасовано')
      }
      await loadAll()
      onClassUpdated()
    }
    setCancellingClass(false)
  }

  async function handleReverseAttendance(enrollment: EnrollmentRow) {
    // Скасування відвідування = корекція: повертаємо в enrolled без штрафу.
    setActionLoading(enrollment.id)
    const { success, error } = await changeEnrollmentStatus(supabase, enrollment.id, 'enrolled', { forceNoCharge: true })
    if (!success) {
      toast.error(error ?? 'Не вдалося скасувати відвідування')
    } else if (cls) {
      await fetchEnrollments(cls.ticket_type, cls.starts_at)
    }
    setConfirmReverseId(null)
    setActionLoading(null)
  }

  // Фізичне видалення помилкового запису. Сесії повертаються в БД (RPC).
  async function handleDeleteEnrollment(enrollment: EnrollmentRow) {
    setActionLoading(enrollment.id)
    const { success, error } = await deleteEnrollment(supabase, enrollment.id)
    if (!success) {
      toast.error(error ?? 'Не вдалося видалити запис')
    } else {
      toast.success('Запис видалено')
      if (cls) await fetchEnrollments(cls.ticket_type, cls.starts_at)
    }
    setConfirmDeleteId(null)
    setActionLoading(null)
  }

  async function handleRestoreClass() {
    if (!cls) return
    setCancellingClass(true)

    const conflict = await checkClassConflicts(supabase, {
      starts_at: cls.starts_at,
      duration_min: cls.duration_min,
      hall_id: cls.hall_id ?? null,
      trainer_id: cls.trainer_id ?? null,
      exclude_id: cls.id,
    })
    if (conflict) {
      toast.error(conflict)
      setCancellingClass(false)
      return
    }

    const { restoredCount, error } = await restoreClass(supabase, cls.id)
    if (error) {
      toast.error('Не вдалося відновити заняття')
    } else {
      setShowRestoreConfirm(false)
      toast.success(restoredCount > 0
        ? `Заняття відновлено. Повернено статуси ${restoredCount} клієнтам`
        : 'Заняття відновлено'
      )
      await loadAll()
      onClassUpdated()
    }
    setCancellingClass(false)
  }

  // Фізичне видалення помилково створеного заняття разом із записами.
  // Сесії повертаються в БД (RPC). Заняття зникає → закриваємо модалку.
  async function handleDeleteClass() {
    if (!cls) return
    setDeletingClass(true)
    const { restoredCount, error } = await deleteClass(supabase, cls.id)
    if (error) {
      toast.error(error)
      setDeletingClass(false)
      return
    }
    setShowDeleteConfirm(false)
    toast.success(restoredCount > 0
      ? `Заняття видалено. Повернено сесії ${restoredCount} ${restoredCount === 1 ? 'клієнту' : 'клієнтам'}`
      : 'Заняття видалено'
    )
    onClassUpdated()
    onClose()
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

  const headerActions = !loading && cls ? (
    <CopyButton text={buildCopyText} ariaLabel="Копіювати деталі заняття" />
  ) : null

  return (
    <>
    <ModalShell
      title={cls ? (cls.title || (typeLabels[cls.ticket_type] ?? cls.ticket_type)) : 'Заняття'}
      onClose={onClose}
      footer={null}
      size="detail"
      headerActions={headerActions}
      bodyClassName={styles.body}
    >
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
                {/* Дата · час (+ бейдж скасування справа) */}
                <div className={styles.metaRow}>
                  <span className={styles.metaWhen}>
                    {new Date(cls.starts_at).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).replace(' р.', '')}
                    {' · '}
                    <span className={styles.metaTime}>{timeRange}</span>
                  </span>
                  {cls.is_cancelled && (
                    <span className="badge badge-class-cancelled">скасовано</span>
                  )}
                </div>

                {/* Тренер · зал */}
                {(cls.trainers || cls.halls) && (
                  <div className={styles.metaSub}>
                    {[cls.trainers?.name, cls.halls?.name].filter(Boolean).join(' · ')}
                  </div>
                )}

                {/* Місця + бар в одну строку */}
                <div className={styles.capacityRow}>
                  <span className={styles.capacityLabel}>Місця</span>
                  <span className={styles.capacityCount}>
                    <strong>{activeCount}</strong>
                    {cls.capacity != null && <span> / {cls.capacity}</span>}
                  </span>
                  <div className={styles.capacityBar}>
                    <div
                      className={styles.capacityBarFill}
                      style={{
                        width: `${fillPctValue}%`,
                        // Повний зал — очікувано, не помилка: нейтральний accent замість
                        // тривожного червоного. Є місця → green («можна записати»).
                        backgroundColor: isFull ? 'var(--accent)' : 'var(--success)',
                      }}
                    />
                  </div>
                </div>

                {cls.notes && (
                  <div className={styles.notesRow}>
                    <span className={styles.notesLabel}>Нотатки</span>
                    <span className={styles.notesValue}>{cls.notes}</span>
                  </div>
                )}

                {/* Етап хореографії: staff бачить компактне поле (rows=1, росте при
                    потребі); read-only глядач — лише як текст, а порожнє поле взагалі
                    ховаємо, щоб не їсти перший екран під списком клієнтів. */}
                {(canManage || cls.choreo_stage) && (
                  <>
                    <div className={styles.detailsDivider} />
                    <div className={styles.choreoRow}>
                      <span className={styles.notesLabel}>Етап хореографії</span>
                      {canManage ? (
                        <>
                          <textarea
                            className={styles.choreoInput}
                            value={choreoDraft}
                            onChange={e => setChoreoDraft(e.target.value)}
                            placeholder="На якому етапі вивчення хореографії…"
                            rows={1}
                          />
                          {choreoDraft.trim() !== (cls.choreo_stage ?? '') && (
                            <button
                              className={styles.choreoSave}
                              onClick={handleSaveChoreo}
                              disabled={savingChoreo}
                            >
                              {savingChoreo ? 'Збереження…' : 'Зберегти'}
                            </button>
                          )}
                        </>
                      ) : (
                        <span className={styles.notesValue}>{cls.choreo_stage}</span>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Enrollment section */}
              <div className={styles.enrollmentSection}>
                <div className={styles.enrollmentHeader}>
                  <h2 className={styles.enrollmentTitle}>Записані клієнти</h2>
                  {!addingClient && cls?.ticket_type !== 'self_training' && canManage && (
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
                        {clientBalance != null && (() => {
                          // Баланс, яким стане після цього запису (як в обліку адміна).
                          const cost = isTwoHour(cls) ? Math.max(selectedHours.length, 1) : 1
                          const after = clientBalance - cost
                          return (
                            <span className={balanceClass(after)}>
                              Баланс після запису: {after}
                            </span>
                          )
                        })()}
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
                          <th className={styles.thNum}></th>
                          <th>Клієнт</th>
                          <th>Статус</th>
                          <th className={styles.balanceDesktop}>Баланс</th>
                          <th className={styles.thRight}>Дія</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mainEnrollments.map((e, i) => {
                          const name = e.clients
                            ? formatClientName(e.clients as { first_name: string | null; last_name: string | null })
                            : '—'
                          const isLoading = actionLoading === e.id
                          const hoursLabel = formatHoursLabel(e.hours_attended, cls.starts_at)
                          return (
                            <tr key={e.id} className={e.status === 'cancelled' ? styles.rowCancelled : ''}>
                              <td className={styles.rowNum}>{i + 1}</td>
                              <td>
                                <span className={styles.rowNumInline}>{i + 1}.</span>
                                <a href={`/clients/${e.client_id}`} className={styles.clientLink}>
                                  {name}
                                </a>
                                {hoursLabel && <span className="badge badge-type">{hoursLabel}</span>}
                                {/* Баланс під іменем — лише на мобілі (десктоп показує окрему колонку) */}
                                {(() => {
                                  const bal = balanceMap[e.client_id]
                                  if (bal == null) return null
                                  return <span className={`${styles.balanceMobile} ${balanceClass(bal)}`}>{bal}</span>
                                })()}
                              </td>
                              <td>
                                {(() => {
                                  const Icon = enrollmentStatusIcon(e.status)
                                  // База (з «(пізно)», без джерела) — client-варіант; джерело
                                  // рендеримо окремим приглушеним span поряд.
                                  const badge = enrollmentBadge(e, 'client')
                                  const sourceHint =
                                    e.status === 'cancelled' ? cancelSourceSuffix(e.cancellation_source) : null
                                  return (
                                    <span className={enrollmentBadgeClass(badge.tone)}>
                                      {Icon && <Icon size={10} strokeWidth={2.5} style={{ flexShrink: 0 }} />}
                                      {badge.label}
                                      {sourceHint && <span style={{ opacity: 0.65, marginLeft: 4 }}>· {sourceHint}</span>}
                                    </span>
                                  )
                                })()}
                              </td>
                              <td className={styles.balanceDesktop}>
                                {(() => {
                                  const bal = balanceMap[e.client_id]
                                  if (bal == null) return <span className="balance-muted">—</span>
                                  return (
                                    <span className={balanceClass(bal)}>{bal}</span>
                                  )
                                })()}
                              </td>
                              <td className={styles.actionsCell}>
                                {confirmReverseId === e.id ? (
                                  <div className={styles.actions}>
                                    <button autoFocus className={styles.btnEdit} onClick={() => handleReverseAttendance(e)} disabled={isLoading}>Так</button>
                                    <button className={styles.btnCancelAdd} onClick={() => setConfirmReverseId(null)} disabled={isLoading}>Ні</button>
                                  </div>
                                ) : confirmDeleteId === e.id ? (
                                  <div className={styles.deleteConfirm}>
                                    <span className={styles.deleteHint}>Видалити назавжди?{e.sessions_used > 0 ? ' Сесію буде повернуто.' : ''}</span>
                                    <div className={styles.actions}>
                                      <button autoFocus className={styles.btnDelete} onClick={() => handleDeleteEnrollment(e)} disabled={isLoading}>Видалити</button>
                                      <button className={styles.btnCancelAdd} onClick={() => setConfirmDeleteId(null)} disabled={isLoading}>Ні</button>
                                    </div>
                                  </div>
                                ) : canManage ? (
                                  <ActionSelect
                                    disabled={isLoading}
                                    onChange={async val => {
                                      if (val === 'attended') { await handleStatusChange(e, 'attended') }
                                      else if (val === 'noshow') { await handleStatusChange(e, 'noshow') }
                                      else if (val === 'cancelled') { await handleStatusChange(e, 'cancelled') }
                                      else if (val === 'reverse') { setConfirmReverseId(e.id) }
                                      else if (val === 'reenroll') { await handleStatusChange(e, 'enrolled') }
                                      else if (val === 'delete') { setConfirmDeleteId(e.id) }
                                    }}
                                    options={[
                                      ...(e.status === 'enrolled' ? [
                                        { value: 'attended', label: enrollmentStatusLabel('attended') },
                                        { value: 'noshow', label: enrollmentStatusLabel('noshow') },
                                        { value: 'cancelled', label: enrollmentStatusLabel('cancelled') },
                                      ] : []),
                                      ...(e.status === 'attended' ? [
                                        { value: 'reverse', label: 'Скасувати відвідування' },
                                      ] : []),
                                      ...((e.status === 'cancelled' || e.status === 'noshow') ? [
                                        { value: 'reenroll', label: 'Повернути' },
                                      ] : []),
                                      { value: 'delete', label: 'Видалити запис' },
                                    ]}
                                  />
                                ) : null}
                                {actionError[e.id] && (
                                  <span className={styles.rowError}>{actionError[e.id]}</span>
                                )}
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
                            <th className={styles.thNum}></th>
                            <th>Клієнт</th>
                            <th className={styles.thRight}>Дія</th>
                          </tr>
                        </thead>
                        <tbody>
                          {waitlist.map((e, i) => {
                            const name = e.clients
                              ? formatClientName(e.clients as { first_name: string | null; last_name: string | null })
                              : '—'
                            const isLoading = actionLoading === e.id
                            return (
                              <tr key={e.id}>
                                <td className={styles.rowNum}>{i + 1}</td>
                                <td>
                                  <span className={styles.rowNumInline}>{i + 1}.</span>
                                  <a href={`/clients/${e.client_id}`} className={styles.clientLink}>
                                    {name}
                                  </a>
                                </td>
                                <td className={styles.actionsCell}>
                                  {canManage && (
                                    <ActionSelect
                                      disabled={isLoading}
                                      onChange={async val => {
                                        if (val === 'confirm') {
                                          if (cls?.capacity != null && activeCount >= cls.capacity) {
                                            setActionError(prev => ({ ...prev, [e.id]: 'Зал заповнений' }))
                                            return
                                          }
                                          await handleStatusChange(e, 'enrolled')
                                        } else if (val === 'cancelled') {
                                          await handleStatusChange(e, 'cancelled')
                                        }
                                      }}
                                      options={[
                                        { value: 'confirm', label: 'Підтвердити' },
                                        { value: 'cancelled', label: enrollmentStatusLabel('cancelled') },
                                      ]}
                                    />
                                  )}
                                  {actionError[e.id] && (
                                    <span className={styles.rowError}>{actionError[e.id]}</span>
                                  )}
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

              {/* Footer actions — лише для тренера цього заняття або staff */}
              {canManage && (
                <div className={styles.footerActions}>
                  <button className={styles.btnEdit} onClick={() => setShowEditModal(true)}>
                    Редагувати
                  </button>
                  {cls.is_cancelled ? (
                    <button className={styles.btnRestore} onClick={() => setShowRestoreConfirm(true)} disabled={cancellingClass}>
                      Відновити
                    </button>
                  ) : (
                    <button className={styles.btnCancel} onClick={() => setShowCancelConfirm(true)} disabled={cancellingClass}>
                      Скасувати заняття
                    </button>
                  )}
                  <button className={styles.btnDeleteGhost} onClick={() => setShowDeleteConfirm(true)} disabled={cancellingClass || deletingClass}>
                    Видалити
                  </button>
                </div>
              )}

              {/* Confirm cancel */}
              {showCancelConfirm && (
                <div className={styles.confirmOverlay} onClick={() => setShowCancelConfirm(false)}>
                  <div className={styles.confirmDialog} onClick={e => e.stopPropagation()}>
                    <p className={styles.confirmText}>Скасувати заняття? Сесії повернуться клієнтам, які відвідали.</p>
                    <div className={styles.confirmActions}>
                      <button className={styles.btnEdit} onClick={() => setShowCancelConfirm(false)} disabled={cancellingClass}>Назад</button>
                      <button autoFocus className={styles.btnCancel} onClick={handleCancelClass} disabled={cancellingClass}>
                        {cancellingClass ? 'Скасування…' : 'Скасувати заняття'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirm restore */}
              {showRestoreConfirm && (
                <div className={styles.confirmOverlay} onClick={() => setShowRestoreConfirm(false)}>
                  <div className={styles.confirmDialog} onClick={e => e.stopPropagation()}>
                    <p className={styles.confirmText}>Відновити заняття? Статуси клієнтів повернуться як були.</p>
                    <div className={styles.confirmActions}>
                      <button className={styles.btnEdit} onClick={() => setShowRestoreConfirm(false)} disabled={cancellingClass}>Назад</button>
                      <button autoFocus className={styles.btnRestore} onClick={handleRestoreClass} disabled={cancellingClass}>
                        {cancellingClass ? 'Відновлення…' : 'Відновити'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirm delete (фізичне видалення заняття) */}
              {showDeleteConfirm && (
                <div className={styles.confirmOverlay} onClick={() => setShowDeleteConfirm(false)}>
                  <div className={styles.confirmDialog} onClick={e => e.stopPropagation()}>
                    <p className={styles.confirmText}>
                      Видалити заняття назавжди? Усі записи буде видалено, списані сесії повернуто клієнтам. Дію не можна скасувати.
                      {cls.series_id && ' Увага: заняття з постійного шаблону — може з’явитися знову при повторному «виставити тиждень».'}
                    </p>
                    <div className={styles.confirmActions}>
                      <button className={styles.btnEdit} onClick={() => setShowDeleteConfirm(false)} disabled={deletingClass}>Назад</button>
                      <button autoFocus className={styles.btnDeleteClass} onClick={handleDeleteClass} disabled={deletingClass}>
                        {deletingClass ? 'Видалення…' : 'Видалити заняття'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
    </ModalShell>
    {showEditModal && cls && (
      <ClassModal
        existing={cls}
        onClose={() => setShowEditModal(false)}
        onSaved={async () => { setShowEditModal(false); await loadAll(); onClassUpdated() }}
      />
    )}
    </>
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
