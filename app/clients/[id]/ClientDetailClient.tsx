'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useRealtime } from '@/lib/useRealtime'
import { getClientDetail, listPastEnrollmentsForClient, listFeedEnrollmentsForClient } from '@/lib/queries/client-detail'
import type { PastEnrollment, FeedEnrollment, UpcomingEnrollment } from '@/lib/queries/client-detail'
import { listSalesForClient, listAllSalesForFeed } from '@/lib/queries/sales'
import type { FeedSale } from '@/lib/queries/sales'
import { listBalanceAfterBySaleIds } from '@/lib/queries/balance-transactions'
import { listTrainingTypeLabels } from '@/lib/queries/training-types'
import { deleteSale } from '@/lib/queries/sales'
import { createClientLogin } from '@/lib/queries/client-login'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import ClientModal from '@/components/ClientModal'
import SaleModal from '@/components/SaleModal'
import type { EditSaleSnapshot } from '@/components/SaleModal'
import { formatClientName, formatSaleDatetime, formatMoney } from '@/lib/formatters'
import { enrollmentStatusLabel, enrollmentStatusClass, enrollmentStatusIcon, paymentLabel, paymentClass } from '@/lib/badges'
import EnrollClientModal from '@/components/EnrollClientModal'
import ClassDetailModal from '@/components/ClassDetailModal'
import { DOW_LABELS_SHORT } from '@/lib/dateUtils'
import { MSG } from '@/lib/messages'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { Client, ClientSessionBalance, Sale, PaymentMethod } from '@/types'
import styles from './client-profile.module.css'

type PermanentEnrollment = {
  id: string
  series_id: string
  class_series: {
    title: string | null
    ticket_type: string
    day_of_week: number
    time_of_day: string
    duration_min: number
    trainers: { name: string } | null
    halls: { name: string } | null
  } | null
}

const SALES_PAGE_SIZE = 20

export default function ClientDetailClient({ id }: { id: string }) {
  const router = useRouter()

  const [client, setClient] = useState<Client | null>(null)
  const [sessionBalances, setSessionBalances] = useState<ClientSessionBalance[]>([])
  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({})
  const [sales, setSales] = useState<Sale[]>([])
  const [salesTotal, setSalesTotal] = useState(0)
  const [salesPage, setSalesPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showSaleModal, setShowSaleModal] = useState(false)
  const [editingSale, setEditingSale] = useState<EditSaleSnapshot | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [balanceAfterMap, setBalanceAfterMap] = useState<Map<string, number>>(new Map())
  const [upcomingEnrollments, setUpcomingEnrollments] = useState<UpcomingEnrollment[]>([])
  const [permanentEnrollments, setPermanentEnrollments] = useState<PermanentEnrollment[]>([])
  const [showEnrollModal, setShowEnrollModal] = useState(false)
  const [detailClassId, setDetailClassId] = useState<string | null>(null)
  const [pastEnrollments, setPastEnrollments] = useState<PastEnrollment[]>([])
  const [pastTotal, setPastTotal] = useState(0)
  const [pastPage, setPastPage] = useState(0)
  const [feedEnrollments, setFeedEnrollments] = useState<FeedEnrollment[]>([])
  const [feedSales, setFeedSales] = useState<FeedSale[]>([])
  const [activeTab, setActiveTab] = useState<'feed' | 'trainings' | 'sales'>('feed')
  const [feedShowAll, setFeedShowAll] = useState(false)
  const [showLoginConfirm, setShowLoginConfirm] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [creatingLogin, setCreatingLogin] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [createdCreds, setCreatedCreds] = useState<{ login: string; password: string; reset: boolean } | null>(null)
  const [credsCopied, setCredsCopied] = useState(false)
  const isMobile = useIsMobile()

  const fetchAllClientData = useCallback(async () => {
    const { client, sessionBalances, permanentEnrollments, upcomingEnrollments } =
      await getClientDetail(supabase, id)
    if (!client) { setFetchError('Клієнта не знайдено'); return }
    setClient(client)
    setSessionBalances(sessionBalances)
    setPermanentEnrollments(permanentEnrollments)
    setUpcomingEnrollments(upcomingEnrollments)
  }, [id])

  const fetchClient = useCallback(async () => {
    const { client } = await getClientDetail(supabase, id)
    if (client) setClient(client)
  }, [id])

  const fetchSessionBalances = useCallback(async () => {
    const { sessionBalances } = await getClientDetail(supabase, id)
    setSessionBalances(sessionBalances)
  }, [id])

  const fetchPermanentEnrollments = useCallback(async () => {
    const { permanentEnrollments } = await getClientDetail(supabase, id)
    setPermanentEnrollments(permanentEnrollments)
  }, [id])

  const fetchUpcomingEnrollments = useCallback(async () => {
    const { upcomingEnrollments } = await getClientDetail(supabase, id)
    setUpcomingEnrollments(upcomingEnrollments)
  }, [id])

  const fetchPastEnrollments = useCallback(async (page: number) => {
    const { data, count } = await listPastEnrollmentsForClient(supabase, id, page, SALES_PAGE_SIZE)
    if (page === 0) {
      setPastEnrollments(data)
    } else {
      setPastEnrollments(prev => [...prev, ...data])
    }
    setPastTotal(count)
  }, [id])

  const fetchFeedEnrollments = useCallback(async () => {
    const { data } = await listFeedEnrollmentsForClient(supabase, id)
    setFeedEnrollments(data)
  }, [id])

  const fetchFeedSales = useCallback(async () => {
    const { data } = await listAllSalesForFeed(supabase, id)
    setFeedSales(data)
  }, [id])

  const fetchSales = useCallback(async (page: number) => {
    const { data: salesData, count } = await listSalesForClient(supabase, id, page, SALES_PAGE_SIZE)
    if (page === 0) {
      setSales(salesData)
    } else {
      setSales(prev => [...prev, ...salesData])
    }
    setSalesTotal(count)

    if (salesData.length > 0) {
      const { data: newMap } = await listBalanceAfterBySaleIds(supabase, salesData.map(s => s.id))
      setBalanceAfterMap(prev => {
        const base = page === 0 ? new Map<string, number>() : new Map(prev)
        newMap.forEach((v, k) => base.set(k, v))
        return base
      })
    } else if (page === 0) {
      setBalanceAfterMap(new Map())
    }
  }, [id])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      listTrainingTypeLabels(supabase).then(r => setTypeLabels(r.data)),
      fetchAllClientData(),
      fetchSales(0),
      fetchPastEnrollments(0),
      fetchFeedEnrollments(),
      fetchFeedSales(),
    ]).then(() => setLoading(false))
  }, [fetchAllClientData, fetchSales, fetchFeedEnrollments])

  const reloadAll = useCallback(() => {
    fetchAllClientData()
    setSalesPage(0)
    fetchSales(0)
    setPastPage(0)
    fetchPastEnrollments(0)
    fetchFeedEnrollments()
    fetchFeedSales()
  }, [fetchAllClientData, fetchSales, fetchPastEnrollments, fetchFeedEnrollments, fetchFeedSales])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') reloadAll()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reloadAll])

  useRealtime(['clients', 'sales', 'balance_transactions', 'client_session_balances', 'enrollments'], reloadAll)

  function handleClientSaved() {
    setShowEditModal(false)
    fetchAllClientData()
  }

  function handleSaleSaved() {
    setShowSaleModal(false)
    setEditingSale(null)
    setSalesPage(0)
    fetchSales(0)
    fetchAllClientData()
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    setDeleteError('')
    const { success, error } = await deleteSale(supabase, deleteId)
    if (!success) {
      setDeleteError(error ?? 'Помилка видалення')
      setDeleting(false)
      return
    }
    setDeleteId(null)
    setDeleting(false)
    setSalesPage(0)
    fetchSales(0)
    fetchAllClientData()
  }

  async function handleCreateLogin() {
    if (!client) return
    setCreatingLogin(true)
    setLoginError('')
    const { login, password, reset, error } = await createClientLogin(client.id)
    setCreatingLogin(false)
    if (error || !login || !password) {
      setLoginError(error ?? 'Помилка створення кабінету')
      return
    }
    setShowLoginConfirm(false)
    setCredsCopied(false)
    setCreatedCreds({ login, password, reset })
    fetchClient()
  }

  function credsText() {
    if (!createdCreds) return ''
    return `Вхід у кабінет студії:\nЛогін: ${createdCreds.login}\nПароль: ${createdCreds.password}\n\nРекомендуємо змінити пароль після входу.`
  }

  async function copyCreds() {
    try {
      await navigator.clipboard.writeText(credsText())
      setCredsCopied(true)
    } catch {
      setLoginError('Не вдалося скопіювати')
    }
  }

  function handleLoadMore() {
    const next = salesPage + 1
    setSalesPage(next)
    fetchSales(next)
  }

  function handleLoadMorePast() {
    const next = pastPage + 1
    setPastPage(next)
    fetchPastEnrollments(next)
  }

  if (loading) return (
    <div className="page-layout">
      <Sidebar />
      <BottomNav />
      <main className="page-main"><div className={styles.empty}>Завантаження...</div></main>
    </div>
  )

  if (fetchError || !client) return (
    <div className="page-layout">
      <Sidebar />
      <BottomNav />
      <main className="page-main"><div className={styles.empty}>{fetchError ?? 'Клієнта не знайдено'}</div></main>
    </div>
  )

  const clientName = formatClientName(client)
  const balance = client.balance ?? 0

  return (
    <div className="page-layout">
      <Sidebar />
      <BottomNav />
      <main className="page-main">

        <div className={`page-head ${styles.topbar}`}>
          <div className={styles.topbarLeft}>
            <button className={styles.backBtn} onClick={() => router.push('/clients')}>
              ← Клієнти
            </button>
            <h1 className="page-title">
              {clientName || <span className={styles.noName}>Клієнт без імені</span>}
            </h1>
          </div>
          <button className={styles.btnEdit} onClick={() => setShowEditModal(true)}>
            Редагувати
          </button>
        </div>

        <div className={`page-body ${styles.content}`}>
          <div className={styles.topGrid}>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.sectionTitle}>Контакти</h2>
                {client.user_id ? (
                  <div className={styles.cabinetActions}>
                    <span className="badge badge-completed">Кабінет активний</span>
                    <button
                      className={styles.btnEdit}
                      onClick={() => { setLoginError(''); setResetMode(true); setShowLoginConfirm(true) }}
                    >
                      Скинути пароль
                    </button>
                  </div>
                ) : (
                  <button
                    className={styles.btnPrimary}
                    onClick={() => { setLoginError(''); setResetMode(false); setShowLoginConfirm(true) }}
                    disabled={!client.phone}
                    title={client.phone ? '' : 'Додайте номер телефону, щоб створити кабінет'}
                  >
                    Створити кабінет
                  </button>
                )}
              </div>
              <dl className={styles.fields}>
                <div className={styles.field}>
                  <dt>Телефон</dt>
                  <dd>
                    {client.phone
                      ? <span>{client.phone}</span>
                      : <span className={styles.empty2}>—</span>}
                  </dd>
                </div>
                <div className={styles.field}>
                  <dt>Instagram</dt>
                  <dd>
                    {client.instagram_username
                      ? <a href={`https://instagram.com/${client.instagram_username.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className={styles.fieldLink}>
                          @{client.instagram_username.replace(/^@/, '')}
                        </a>
                      : <span className={styles.empty2}>—</span>}
                  </dd>
                </div>
                <div className={styles.field}>
                  <dt>Telegram</dt>
                  <dd>
                    {client.telegram_username
                      ? <a href={`https://t.me/${client.telegram_username.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className={styles.fieldLink}>
                          @{client.telegram_username.replace(/^@/, '')}
                        </a>
                      : <span className={styles.empty2}>—</span>}
                  </dd>
                </div>
              </dl>
            </section>

            <section className={styles.card}>
              <h2 className={styles.sectionTitle}>Депозит</h2>
              <div className={styles.balanceRow}>
                <span className={
                  balance > 0 ? styles.balancePos :
                  balance < 0 ? styles.balanceNeg :
                  styles.balanceZero
                }>
                  {formatMoney(balance)}
                </span>
                {balance < 0 && <span className="badge badge-danger">Від&apos;ємний депозит</span>}
              </div>
              {client.balance_updated_at && (
                <div className={styles.fieldMeta}>
                  Оновлено {new Date(client.balance_updated_at).toLocaleDateString('uk-UA')}
                </div>
              )}
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.sectionTitle}>Залишок занять</h2>
                <button className={styles.btnPrimary} onClick={() => setShowSaleModal(true)}>
                  Записати продаж
                </button>
              </div>
              {sessionBalances.length === 0 ? (
                <div className={styles.emptySection}>
                  <span className={styles.empty2}>{MSG.empty.activeEnrollments}</span>
                </div>
              ) : (
                <div className={styles.sessionCards}>
                  {sessionBalances.map(b => (
                    <div key={b.ticket_type} className={styles.sessionCard}>
                      <span className={styles.sessionType}>
                        {typeLabels[b.ticket_type] ?? b.ticket_type}
                      </span>
                      <span className={
                        b.sessions_balance > 0 ? styles.sessionPos :
                        b.sessions_balance < 0 ? styles.sessionNeg :
                        styles.sessionZero
                      }>
                        {b.sessions_balance}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.sectionTitle}>Постійні записи</h2>
                <button className={styles.btnPrimary} onClick={() => router.push('/schedule/templates')}>
                  Шаблони →
                </button>
              </div>
              {permanentEnrollments.length === 0 ? (
                <div className={styles.emptySection}>
                  <span className={styles.empty2}>{MSG.empty.permanentRecords}</span>
                </div>
              ) : (
                <div className={styles.sessionCards}>
                  {permanentEnrollments.filter(e => e.class_series).map(e => {
                    const s = e.class_series!
                    const [h, m] = s.time_of_day.split(':')
                    const startMin = parseInt(h) * 60 + parseInt(m)
                    const endMin = startMin + s.duration_min
                    const timeStr = `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}–${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`
                    return (
                      <div key={e.id} className={styles.sessionCard}>
                        <span className={styles.sessionType}>
                          {DOW_LABELS_SHORT[s.day_of_week]} {timeStr} · {typeLabels[s.ticket_type] ?? s.ticket_type}
                          {s.trainers?.name ? ` · ${s.trainers.name}` : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

          </div>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.sectionTitle}>Майбутні записи</h2>
              <button className={styles.btnPrimary} onClick={() => setShowEnrollModal(true)}>
                Записати на заняття
              </button>
            </div>
            {upcomingEnrollments.length === 0 ? (
              <div className={styles.emptySection}>
                <span className={styles.empty2}>{MSG.empty.futureEnrollments}</span>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className={`${styles.tableWrap} ${styles.upcomingTableDesktop}`}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Дата і час</th>
                        <th>Тип</th>
                        <th>Тренер</th>
                        <th>Зал</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...upcomingEnrollments].filter(e => e.classes).sort((a, b) => new Date(a.classes!.starts_at).getTime() - new Date(b.classes!.starts_at).getTime()).map(e => {
                        const cls = e.classes!
                        const start = new Date(cls.starts_at)
                        const end = new Date(start.getTime() + cls.duration_min * 60000)
                        const timeStr = `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(end.getMinutes())}`
                        return (
                          <tr key={e.id}>
                            <td className={styles.dateCell}>
                              {start.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })} {timeStr}
                            </td>
                            <td>
                              {typeLabels[cls.ticket_type] ?? cls.ticket_type}{cls.title ? ` · ${cls.title}` : ''}
                              {cls.choreo_stage && <div className={styles.choreoSub}>🩰 {cls.choreo_stage}</div>}
                            </td>
                            <td>{cls.trainers?.name ?? <span className={styles.empty2}>—</span>}</td>
                            <td>{cls.halls?.name ?? <span className={styles.empty2}>—</span>}</td>
                            <td>
                              <button
                                className={styles.btnRowEdit}
                                onClick={() => setDetailClassId(e.class_id)}
                              >
                                Перейти
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Mobile cards */}
                <div className={`${styles.cardList} ${styles.upcomingCardList}`}>
                  {[...upcomingEnrollments].filter(e => e.classes).sort((a, b) => new Date(a.classes!.starts_at).getTime() - new Date(b.classes!.starts_at).getTime()).map(e => {
                    const cls = e.classes!
                    const start = new Date(cls.starts_at)
                    const end = new Date(start.getTime() + cls.duration_min * 60000)
                    const timeStr = `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(end.getMinutes())}`
                    const dateStr = start.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    return (
                      <div key={e.id} className={styles.itemCard}>
                        <div className={styles.itemCardRow}>
                          <span className={styles.itemCardMain}>
                            {typeLabels[cls.ticket_type] ?? cls.ticket_type}{cls.title ? ` · ${cls.title}` : ''}
                          </span>
                          <span className={styles.itemCardDate}>{dateStr}</span>
                        </div>
                        <div className={styles.itemCardRow}>
                          <span className={styles.itemCardSub}>
                            {timeStr}{cls.trainers?.name ? ` · ${cls.trainers.name}` : ''}{cls.halls?.name ? ` · ${cls.halls.name}` : ''}
                          </span>
                        </div>
                        {cls.choreo_stage && (
                          <div className={styles.itemCardRow}>
                            <span className={styles.choreoSub}>🩰 {cls.choreo_stage}</span>
                          </div>
                        )}
                        <div className={styles.itemCardActions}>
                          <button
                            className={styles.btnRowEdit}
                            style={{ flex: 1, height: 36 }}
                            onClick={() => setDetailClassId(e.class_id)}
                          >
                            Перейти до заняття
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </section>

          <section className={styles.card}>
            <div className={styles.tabHeader}>
              <div className={styles.tabBar}>
                <button
                  className={activeTab === 'feed' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                  onClick={() => setActiveTab('feed')}
                >
                  Зведена стрічка
                </button>
                <button
                  className={activeTab === 'trainings' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                  onClick={() => setActiveTab('trainings')}
                >
                  Тренування
                </button>
                <button
                  className={activeTab === 'sales' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                  onClick={() => setActiveTab('sales')}
                >
                  Продажі
                </button>
              </div>
            </div>

            {activeTab === 'feed' && (() => {
              type FeedItem =
                | { kind: 'enrollment'; date: number; data: FeedEnrollment; runningBalance: Record<string, number> }
                | { kind: 'sale'; date: number; data: FeedSale; runningBalance: Record<string, number> }

              const rawItems: Array<{ kind: 'enrollment'; date: number; data: FeedEnrollment } | { kind: 'sale'; date: number; data: FeedSale }> = [
                ...feedEnrollments.filter(e => e.classes).map(e => ({
                  kind: 'enrollment' as const,
                  date: new Date(e.classes!.starts_at).getTime(),
                  data: e,
                })),
                ...feedSales.map(s => ({
                  kind: 'sale' as const,
                  date: new Date(s.created_at).getTime(),
                  data: s,
                })),
              ].sort((a, b) => a.date - b.date)

              // compute running session balance per ticket_type, oldest→newest
              const running: Record<string, number> = {}
              const items: FeedItem[] = rawItems.map(item => {
                if (item.kind === 'sale') {
                  const type = item.data.ticket_type
                  if (type && item.data.sessions != null) {
                    running[type] = (running[type] ?? 0) + item.data.sessions
                  }
                } else {
                  const type = item.data.classes?.ticket_type
                  if (type && item.data.sessions_used > 0) {
                    running[type] = (running[type] ?? 0) - item.data.sessions_used
                  }
                }
                return { ...item, runningBalance: { ...running } } as FeedItem
              })

              // display newest first
              items.reverse()

              const FEED_PAGE = 30
              const visible = feedShowAll ? items : items.slice(0, FEED_PAGE)

              if (items.length === 0) return (
                <div className={styles.emptySection}>
                  <span className={styles.empty2}>{MSG.empty.events}</span>
                </div>
              )

              return (
                <>
                  {!isMobile && (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Дата і час</th>
                            <th>Подія</th>
                            <th>Тип / Операція</th>
                            <th>Тренер</th>
                            <th>Деталі</th>
                            <th>Залишок</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map(item => {
                            if (item.kind === 'enrollment') {
                              const e = item.data
                              const cls = e.classes!
                              const start = new Date(cls.starts_at)
                              const end = new Date(start.getTime() + cls.duration_min * 60000)
                              const timeStr = `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(end.getMinutes())}`
                              const bal = item.runningBalance[cls.ticket_type]
                              return (
                                <tr key={`e-${e.id}`}>
                                  <td className={styles.dateCell}>
                                    {start.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })} {timeStr}
                                  </td>
                                  <td>
                                    {(() => {
                                      const Icon = enrollmentStatusIcon(e.status)
                                      return (
                                        <span className={enrollmentStatusClass(e.status)}>
                                          {Icon && <Icon size={10} strokeWidth={2.5} style={{ flexShrink: 0 }} />}
                                          {enrollmentStatusLabel(e.status)}
                                        </span>
                                      )
                                    })()}
                                  </td>
                                  <td>{typeLabels[cls.ticket_type] ?? cls.ticket_type}{cls.title ? ` · ${cls.title}` : ''}</td>
                                  <td>{cls.trainers?.name ?? <span className={styles.empty2}>—</span>}</td>
                                  <td>{cls.halls?.name ?? <span className={styles.empty2}>—</span>}</td>
                                  <td className={styles.numCell}>
                                    {bal !== undefined
                                      ? <span className={bal > 0 ? 'balance-ok' : bal < 0 ? 'balance-warn' : 'balance-zero'}>{bal}</span>
                                      : <span className={styles.empty2}>—</span>
                                    }
                                  </td>
                                </tr>
                              )
                            } else {
                              const s = item.data
                              const delta = s.amount_given - s.price_paid
                              const type = s.ticket_type
                              const bal = type ? item.runningBalance[type] : undefined
                              return (
                                <tr key={`s-${s.id}`}>
                                  <td className={styles.dateCell}>{formatSaleDatetime(s.created_at)}</td>
                                  <td>
                                    <span className={"badge badge-sale"}>Продаж</span>
                                  </td>
                                  <td>
                                    {s.ticket_name
                                      ? s.ticket_name
                                      : delta >= 0
                                        ? <span className={styles.opTopup}>↑ Поповнення</span>
                                        : <span className={styles.opDeduction}>↓ Списання</span>
                                    }
                                  </td>
                                  <td>{s.trainers?.name ?? <span className={styles.empty2}>—</span>}</td>
                                  <td>
                                    <span className={paymentClass(s.payment_method)}>
                                      {paymentLabel(s.payment_method)}
                                    </span>
                                  </td>
                                  <td className={styles.numCell}>
                                    {bal !== undefined
                                      ? <span className={bal > 0 ? 'balance-ok' : bal < 0 ? 'balance-warn' : 'balance-zero'}>{bal}</span>
                                      : <span className={styles.empty2}>—</span>
                                    }
                                  </td>
                                </tr>
                              )
                            }
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {isMobile && (
                    <div className={styles.cardList}>
                      {visible.map(item => {
                        if (item.kind === 'enrollment') {
                          const e = item.data
                          const cls = e.classes!
                          const start = new Date(cls.starts_at)
                          const end = new Date(start.getTime() + cls.duration_min * 60000)
                          const timeStr = `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(end.getMinutes())}`
                          const dateStr = start.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
                          const typeName = (typeLabels[cls.ticket_type] ?? cls.ticket_type) + (cls.title ? ` · ${cls.title}` : '')
                          const bal = item.runningBalance[cls.ticket_type]
                          const Icon = enrollmentStatusIcon(e.status)
                          return (
                            <div key={`e-${e.id}`} className={styles.itemCard}>
                              <span className={styles.itemCardLabel}>Тренування</span>
                              <div className={styles.itemCardRow}>
                                <span className={styles.itemCardMain}>{typeName}</span>
                                <span className={styles.itemCardDate}>{dateStr}</span>
                              </div>
                              <div className={styles.itemCardRow}>
                                <span className={styles.itemCardSub}>
                                  {[cls.trainers?.name, cls.halls?.name].filter(Boolean).join(' · ') || '—'}
                                </span>
                                <span className={styles.itemCardTime}>{timeStr}</span>
                              </div>
                              <div className={styles.itemCardRow}>
                                <span className={enrollmentStatusClass(e.status)}>
                                  {Icon && <Icon size={10} strokeWidth={2.5} style={{ flexShrink: 0 }} />}
                                  {enrollmentStatusLabel(e.status)}
                                </span>
                                {bal !== undefined
                                  ? <span className={bal > 0 ? 'balance-ok' : bal < 0 ? 'balance-warn' : 'balance-zero'}>
                                      Залишок: {bal} год.
                                    </span>
                                  : null
                                }
                              </div>
                            </div>
                          )
                        } else {
                          const s = item.data
                          const delta = s.amount_given - s.price_paid
                          const type = s.ticket_type
                          const bal = type ? item.runningBalance[type] : undefined
                          const opLabel = s.ticket_name
                            ? s.ticket_name
                            : delta >= 0 ? '↑ Поповнення' : '↓ Списання'
                          return (
                            <div key={`s-${s.id}`} className={styles.itemCard}>
                              <span className={styles.itemCardLabel}>Продаж</span>
                              <div className={styles.itemCardRow}>
                                <span className={styles.itemCardMain}>{opLabel}</span>
                                <span className={styles.itemCardDate}>{formatSaleDatetime(s.created_at)}</span>
                              </div>
                              <div className={styles.itemCardRow}>
                                <span className={styles.itemCardSub}>{s.trainers?.name ?? '—'}</span>
                                <span className={paymentClass(s.payment_method)}>
                                  {paymentLabel(s.payment_method)}
                                </span>
                              </div>
                              {bal !== undefined && (
                                <div className={styles.itemCardRow}>
                                  <span />
                                  <span className={bal > 0 ? 'balance-ok' : bal < 0 ? 'balance-warn' : 'balance-zero'}>
                                    Залишок: {bal} год.
                                  </span>
                                </div>
                              )}
                            </div>
                          )
                        }
                      })}
                    </div>
                  )}

                  {!feedShowAll && items.length > FEED_PAGE && (
                    <button className={styles.btnLoadMore} onClick={() => setFeedShowAll(true)}>
                      Показати всі ({items.length - FEED_PAGE} більше)
                    </button>
                  )}
                </>
              )
            })()}

            {activeTab === 'trainings' && (
              pastEnrollments.length === 0 ? (
                <div className={styles.emptySection}>
                  <span className={styles.empty2}>Ще не було тренувань</span>
                </div>
              ) : (
                <>
                  {!isMobile && (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Дата і час</th>
                            <th>Тип</th>
                            <th>Тренер</th>
                            <th>Зал</th>
                            <th>Занять</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pastEnrollments.filter(e => e.classes).map(e => {
                            const cls = e.classes!
                            const start = new Date(cls.starts_at)
                            const end = new Date(start.getTime() + cls.duration_min * 60000)
                            const timeStr = `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(end.getMinutes())}`
                            return (
                              <tr key={e.id}>
                                <td className={styles.dateCell}>
                                  {start.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })} {timeStr}
                                </td>
                                <td>{typeLabels[cls.ticket_type] ?? cls.ticket_type}{cls.title ? ` · ${cls.title}` : ''}</td>
                                <td>{cls.trainers?.name ?? <span className={styles.empty2}>—</span>}</td>
                                <td>{cls.halls?.name ?? <span className={styles.empty2}>—</span>}</td>
                                <td className={styles.numCell}>{e.sessions_used}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {isMobile && (
                    <div className={styles.cardList}>
                      {pastEnrollments.filter(e => e.classes).map(e => {
                        const cls = e.classes!
                        const start = new Date(cls.starts_at)
                        const end = new Date(start.getTime() + cls.duration_min * 60000)
                        const timeStr = `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(end.getMinutes())}`
                        const dateStr = start.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        const typeName = (typeLabels[cls.ticket_type] ?? cls.ticket_type) + (cls.title ? ` · ${cls.title}` : '')
                        const Icon = enrollmentStatusIcon(e.status)
                        return (
                          <div key={e.id} className={styles.itemCard}>
                            <div className={styles.itemCardRow}>
                              <span className={styles.itemCardMain}>{typeName}</span>
                              <span className={styles.itemCardDate}>{dateStr}</span>
                            </div>
                            <div className={styles.itemCardRow}>
                              <span className={styles.itemCardSub}>
                                {[cls.trainers?.name, cls.halls?.name].filter(Boolean).join(' · ') || '—'}
                              </span>
                              <span className={styles.itemCardTime}>{timeStr}</span>
                            </div>
                            <div className={styles.itemCardRow}>
                              <span className={enrollmentStatusClass(e.status)}>
                                {Icon && <Icon size={10} strokeWidth={2.5} style={{ flexShrink: 0 }} />}
                                {enrollmentStatusLabel(e.status)}
                              </span>
                              {e.sessions_used > 1 && (
                                <span className={styles.itemCardMeta}>списано: {e.sessions_used} год.</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {pastEnrollments.length < pastTotal && (
                    <button className={styles.btnLoadMore} onClick={handleLoadMorePast}>
                      Завантажити ще ({pastTotal - pastEnrollments.length})
                    </button>
                  )}
                </>
              )
            )}

            {activeTab === 'sales' && (
              sales.length === 0 ? (
                <div className={styles.emptySection}>
                  <span className={styles.empty2}>Покупок ще не було</span>
                </div>
              ) : (
                <>
                  {!isMobile && (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Дата</th>
                            <th>Операція</th>
                            <th>Занять</th>
                            <th>Ціна</th>
                            <th>Оплачено</th>
                            <th>Δ Депозит</th>
                            <th>Депозит після</th>
                            <th>Спосіб</th>
                            <th>Тренер</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {sales.map(s => {
                            const delta = s.amount_given - s.price_paid
                            const balAfter = balanceAfterMap.get(s.id)
                            return (
                            <tr key={s.id}>
                              <td className={styles.dateCell}>{formatSaleDatetime(s.created_at)}</td>
                              <td>
                                {s.ticket_name
                                  ? s.ticket_name
                                  : delta >= 0
                                    ? <span className={styles.opTopup}>↑ Поповнення</span>
                                    : <span className={styles.opDeduction}>↓ Списання</span>
                                }
                              </td>
                              <td className={styles.numCell}>{s.sessions ?? <span className={styles.empty2}>—</span>}</td>
                              <td className={styles.numCell}>
                                {s.ticket_price != null ? formatMoney(s.ticket_price) : <span className={styles.empty2}>—</span>}
                              </td>
                              <td className={styles.numCell}>
                                {s.ticket_id != null && s.payment_method !== 'deposit'
                                  ? formatMoney(s.price_paid)
                                  : <span className={styles.empty2}>—</span>}
                              </td>
                              <td className={styles.numCell}>
                                {delta > 0
                                  ? <span className={styles.deltaPos}>+{formatMoney(delta)}</span>
                                  : delta < 0
                                    ? <span className={styles.deltaNeg}>{formatMoney(delta)}</span>
                                    : <span className={styles.empty2}>—</span>
                                }
                              </td>
                              <td className={styles.numCell}>
                                {balAfter !== undefined
                                  ? <span className={balAfter >= 0 ? styles.deltaPos : styles.deltaNeg}>{formatMoney(balAfter)}</span>
                                  : <span className={styles.empty2}>—</span>
                                }
                              </td>
                              <td>
                                <span className={paymentClass(s.payment_method)}>
                                  {paymentLabel(s.payment_method)}
                                </span>
                              </td>
                              <td>{s.trainers?.name ?? <span className={styles.empty2}>—</span>}</td>
                              <td>
                                <div className={styles.actions}>
                                  <button
                                    className={styles.btnRowEdit}
                                    onClick={() => setEditingSale({
                                      id: s.id,
                                      client_id: s.client_id,
                                      client_name: formatClientName(s.clients),
                                      ticket_id: s.ticket_id,
                                      ticket_name: s.ticket_name,
                                      ticket_price: s.ticket_price,
                                      ticket_type: s.ticket_type ?? null,
                                      sessions: s.sessions,
                                      trainer_id: s.trainer_id,
                                      trainer_name: s.trainers?.name ?? null,
                                      cash_holder: s.cash_holder ?? null,
                                      price_paid: s.price_paid,
                                      amount_given: s.amount_given,
                                      payment_method: s.payment_method as PaymentMethod,
                                      notes: s.notes,
                                      created_at: s.created_at,
                                    })}
                                  >
                                    Змінити
                                  </button>
                                  <button className={styles.btnRowDel} onClick={() => setDeleteId(s.id)}>
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

                  {isMobile && (
                    <div className={styles.cardList}>
                      {sales.map(s => {
                        const delta = s.amount_given - s.price_paid
                        const opLabel = s.ticket_name
                          ? s.ticket_name
                          : delta >= 0 ? '↑ Поповнення' : '↓ Списання'
                        const isCash = s.payment_method === 'cash'
                        return (
                          <div key={s.id} className={styles.itemCard}>
                            <div className={styles.itemCardRow}>
                              <span className={styles.itemCardMain}>{opLabel}</span>
                              <span className={styles.itemCardDate}>{formatSaleDatetime(s.created_at)}</span>
                            </div>
                            <div className={styles.itemCardRow}>
                              {isCash && s.trainers?.name
                                ? <span className={styles.itemCardSub}>{s.trainers.name}</span>
                                : <span className={paymentClass(s.payment_method)}>
                                    {paymentLabel(s.payment_method)}
                                  </span>
                              }
                              {s.sessions != null
                                ? <span className={delta > 0 ? styles.sessionsPos : delta < 0 ? styles.sessionsNeg : styles.itemCardMeta}>
                                    {delta > 0 ? '+' : ''}{s.sessions} год.
                                  </span>
                                : <span className={delta > 0 ? styles.deltaPos : delta < 0 ? styles.deltaNeg : styles.itemCardMeta}>
                                    {delta > 0 ? '+' : ''}{formatMoney(Math.abs(delta))}
                                  </span>
                              }
                            </div>
                            {isCash && s.trainers?.name && (
                              <div className={styles.itemCardRow}>
                                <span className={paymentClass(s.payment_method)}>
                                  {paymentLabel(s.payment_method)}
                                </span>
                                <span />
                              </div>
                            )}
                            <div className={styles.itemCardActions}>
                              <button
                                className={styles.btnRowEdit}
                                onClick={() => setEditingSale({
                                  id: s.id,
                                  client_id: s.client_id,
                                  client_name: formatClientName(s.clients),
                                  ticket_id: s.ticket_id,
                                  ticket_name: s.ticket_name,
                                  ticket_price: s.ticket_price,
                                  ticket_type: s.ticket_type ?? null,
                                  sessions: s.sessions,
                                  trainer_id: s.trainer_id,
                                  trainer_name: s.trainers?.name ?? null,
                                  cash_holder: s.cash_holder ?? null,
                                  price_paid: s.price_paid,
                                  amount_given: s.amount_given,
                                  payment_method: s.payment_method as PaymentMethod,
                                  notes: s.notes,
                                  created_at: s.created_at,
                                })}
                              >
                                Змінити
                              </button>
                              <button className={styles.btnRowDel} onClick={() => setDeleteId(s.id)}>
                                Видалити
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {sales.length < salesTotal && (
                    <button className={styles.btnLoadMore} onClick={handleLoadMore}>
                      Завантажити ще ({salesTotal - sales.length})
                    </button>
                  )}
                </>
              )
            )}
          </section>

        </div>
      </main>

      {showEnrollModal && (
        <EnrollClientModal
          client={client}
          typeLabels={typeLabels}
          onClose={() => setShowEnrollModal(false)}
          onSaved={() => { setShowEnrollModal(false); fetchUpcomingEnrollments() }}
        />
      )}

      {detailClassId && (
        <ClassDetailModal
          classId={detailClassId}
          onClose={() => setDetailClassId(null)}
          onClassUpdated={reloadAll}
        />
      )}

      {showEditModal && (
        <ClientModal
          client={client}
          onClose={() => setShowEditModal(false)}
          onSaved={handleClientSaved}
        />
      )}

      {showSaleModal && (
        <SaleModal
          preselectedClient={client}
          onClose={() => setShowSaleModal(false)}
          onSaved={handleSaleSaved}
        />
      )}

      {editingSale && (
        <SaleModal
          editSale={editingSale}
          onClose={() => setEditingSale(null)}
          onSaved={handleSaleSaved}
        />
      )}

      {showLoginConfirm && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <h3>{resetMode ? 'Скинути пароль?' : 'Створити кабінет клієнту?'}</h3>
            <p>
              {resetMode ? (
                <>Згенеруємо новий пароль для входу за номером <strong>{client.phone}</strong>.
                  Старий пароль перестане діяти. Новий зʼявиться після скидання — надішліть його клієнту.</>
              ) : (
                <>Клієнт зможе входити у свій кабінет за номером <strong>{client.phone}</strong>.
                  Логін і пароль зʼявляться після створення — надішліть їх клієнту.</>
              )}
            </p>
            {loginError && <p className={styles.confirmError}>{loginError}</p>}
            <div className={styles.confirmBtns}>
              <button
                className={styles.btnConfirmCancel}
                onClick={() => { setShowLoginConfirm(false); setLoginError('') }}
              >
                Скасувати
              </button>
              <button
                className={styles.btnPrimary}
                onClick={handleCreateLogin}
                disabled={creatingLogin}
              >
                {creatingLogin ? (resetMode ? 'Скидання...' : 'Створення...') : (resetMode ? 'Скинути' : 'Створити')}
              </button>
            </div>
          </div>
        </div>
      )}

      {createdCreds && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <h3>{createdCreds.reset ? 'Пароль скинуто' : 'Кабінет створено'}</h3>
            <p>Надішліть ці дані клієнту в Instagram або Telegram:</p>
            <pre style={{
              whiteSpace: 'pre-wrap', background: 'var(--bg-2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 12, fontSize: 14, margin: '8px 0',
            }}>{credsText()}</pre>
            {loginError && <p className={styles.confirmError}>{loginError}</p>}
            <div className={styles.confirmBtns}>
              <button className={styles.btnConfirmCancel} onClick={() => setCreatedCreds(null)}>
                Закрити
              </button>
              <button className={styles.btnPrimary} onClick={copyCreds}>
                {credsCopied ? 'Скопійовано ✓' : 'Скопіювати'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <h3>Видалити запис?</h3>
            <p>Цю дію неможливо скасувати. Баланс клієнта буде автоматично скориговано.</p>
            {deleteError && <p className={styles.confirmError}>{deleteError}</p>}
            <div className={styles.confirmBtns}>
              <button
                className={styles.btnConfirmCancel}
                onClick={() => { setDeleteId(null); setDeleteError('') }}
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

function pad(n: number) { return String(n).padStart(2, '0') }
