'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
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
  status: 'enrolled' | 'attended' | 'cancelled' | 'noshow'
  sessions_used: number
  created_at: string
  clients: { first_name: string | null; last_name: string | null } | null
}

const STATUS_LABELS: Record<string, string> = {
  enrolled:  'Записаний',
  attended:  'Відвідав',
  cancelled: 'Скасовано',
  noshow:    'Не прийшов',
}

const STATUS_STYLES: Record<string, string> = {
  enrolled:  'badgeEnrolled',
  attended:  'badgeAttended',
  cancelled: 'badgeCancelled',
  noshow:    'badgeNoshow',
}

export default function ClassDetailPage() {
  const router = useRouter()
  const { classId } = useParams<{ classId: string }>()

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
  const [enrolling, setEnrolling] = useState(false)
  const [enrollError, setEnrollError] = useState<string | null>(null)

  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<Record<string, string>>({})
  const [cancellingClass, setCancellingClass] = useState(false)
  const [confirmCancelClass, setConfirmCancelClass] = useState(false)
  const [confirmDeleteClass, setConfirmDeleteClass] = useState(false)
  const [deletingClass, setDeletingClass] = useState(false)

  const fetchClass = useCallback(async () => {
    const { data, error } = await supabase
      .from('classes')
      .select('*, trainers(name), halls(name)')
      .eq('id', classId)
      .single()
    if (error || !data) {
      setFetchError('Заняття не знайдено')
      return null
    }
    setCls(data as ClassWithJoins)
    return data as ClassWithJoins
  }, [classId])

  const fetchEnrollments = useCallback(async (ticketType: string) => {
    const { data } = await supabase
      .from('enrollments')
      .select('id, client_id, status, sessions_used, created_at, clients(first_name, last_name)')
      .eq('class_id', classId)
      .order('created_at')
    const rows = (data ?? []) as EnrollmentRow[]
    setEnrollments(rows)

    const clientIds = rows.map(e => e.client_id)
    if (clientIds.length > 0) {
      const { data: balances } = await supabase
        .from('client_session_balances')
        .select('client_id, sessions_balance')
        .in('client_id', clientIds)
        .eq('ticket_type', ticketType)
      const map: Record<string, number> = {}
      for (const b of balances ?? []) map[b.client_id] = b.sessions_balance
      setBalanceMap(map)
    } else {
      setBalanceMap({})
    }
  }, [classId])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const clsData = await fetchClass()
    if (clsData) await fetchEnrollments(clsData.ticket_type)
    setLoading(false)
  }, [fetchClass, fetchEnrollments])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    supabase.from('training_types').select('code, label').then(({ data }) => {
      const map: Record<string, string> = {}
      for (const t of data ?? []) map[t.code] = t.label
      setTypeLabels(map)
    })
  }, [])

  async function handleClientSelect(client: Client) {
    setSelectedClient(client)
    setEnrollError(null)
    if (!cls) return
    const { data } = await supabase
      .from('client_session_balances')
      .select('sessions_balance')
      .eq('client_id', client.id)
      .eq('ticket_type', cls.ticket_type)
      .single()
    setClientBalance(data?.sessions_balance ?? 0)
  }

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

    const { error } = await supabase.from('enrollments').insert({
      class_id: cls.id,
      client_id: selectedClient.id,
      status: 'enrolled',
    })

    if (error) {
      setEnrollError(error.message)
      setEnrolling(false)
      return
    }
    setAddingClient(false)
    setSelectedClient(null)
    setClientBalance(null)
    await fetchEnrollments(cls.ticket_type)
    setEnrolling(false)
  }

  async function handleMarkAttended(enrollmentId: string) {
    setActionLoading(enrollmentId)
    setActionError(prev => { const n = { ...prev }; delete n[enrollmentId]; return n })
    const { data, error } = await supabase.rpc('mark_attendance', {
      p_enrollment_id: enrollmentId,
      p_sessions_used: 1,
    })
    if (error || data?.[0]?.success === false) {
      setActionError(prev => ({ ...prev, [enrollmentId]: data?.[0]?.error_message ?? error?.message ?? 'Помилка' }))
    } else if (cls) {
      await fetchEnrollments(cls.ticket_type)
    }
    setActionLoading(null)
  }

  async function handleUpdateStatus(enrollmentId: string, status: 'noshow' | 'cancelled') {
    setActionLoading(enrollmentId)
    const { error } = await supabase.from('enrollments').update({ status }).eq('id', enrollmentId)
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
    const { error } = await supabase.from('classes').update({ is_cancelled: true }).eq('id', cls.id)
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
    const { error } = await supabase.from('classes').update({ is_cancelled: false }).eq('id', cls.id)
    if (error) {
      toast.error('Не вдалося відновити заняття')
    } else {
      await fetchClass()
    }
    setCancellingClass(false)
  }

  async function handleDeleteClass() {
    if (!cls) return
    setDeletingClass(true)
    const { error: e1 } = await supabase
      .from('enrollments')
      .update({ status: 'cancelled' })
      .eq('class_id', cls.id)
    const { error: e2 } = await supabase
      .from('classes')
      .update({ is_cancelled: true })
      .eq('id', cls.id)
    if (e1 || e2) {
      toast.error('Не вдалося видалити заняття')
      setDeletingClass(false)
      return
    }
    router.push('/schedule')
  }

  if (loading) {
    return (
      <div className={styles.layout}>
        <Sidebar />
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
        <main className={styles.main}>
          <div className={styles.loadingState}>{fetchError ?? 'Заняття не знайдено'}</div>
        </main>
      </div>
    )
  }

  const activeCount = enrollments.filter(e => e.status === 'enrolled' || e.status === 'attended').length
  const stillEnrolled = enrollments.filter(e => e.status === 'enrolled')
  const classIsPast = new Date(cls.starts_at) < new Date()
  const startDate = new Date(cls.starts_at)
  const endDate = new Date(startDate.getTime() + cls.duration_min * 60000)
  const timeRange = `${formatTime(startDate)}–${formatTime(endDate)}`

  return (
    <div className={styles.layout}>
      <Sidebar />
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
            <button className={styles.btnEdit} onClick={() => setShowEditModal(true)} disabled={deletingClass}>
              Редагувати
            </button>
            {!confirmDeleteClass && (
              cls.is_cancelled ? (
                <button className={styles.btnRestore} onClick={handleRestoreClass} disabled={cancellingClass || deletingClass}>
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
                <button className={styles.btnCancel} onClick={() => setConfirmCancelClass(true)} disabled={deletingClass}>
                  Скасувати заняття
                </button>
              )
            )}
            {confirmDeleteClass ? (
              <>
                <span className={styles.confirmPrompt}>Видалити тренування?</span>
                <button className={styles.btnCancel} onClick={handleDeleteClass} disabled={deletingClass}>
                  {deletingClass ? 'Видалення...' : 'Так'}
                </button>
                <button className={styles.btnEdit} onClick={() => setConfirmDeleteClass(false)} disabled={deletingClass}>
                  Ні
                </button>
              </>
            ) : (
              <button className={styles.btnCancel} onClick={() => { setConfirmCancelClass(false); setConfirmDeleteClass(true) }} disabled={cancellingClass || deletingClass}>
                Видалити
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
            {enrollments.length === 0 ? (
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
                    {enrollments.map(e => {
                      const name = e.clients
                        ? formatClientName(e.clients as { first_name: string | null; last_name: string | null })
                        : '—'
                      const bal = balanceMap[e.client_id]
                      const isLoading = actionLoading === e.id
                      return (
                        <tr key={e.id} className={e.status === 'cancelled' ? styles.rowCancelled : ''}>
                          <td>
                            <a
                              href={`/clients/${e.client_id}`}
                              className={styles.clientLink}
                            >
                              {name}
                            </a>
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
                                    onClick={() => handleMarkAttended(e.id)}
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
