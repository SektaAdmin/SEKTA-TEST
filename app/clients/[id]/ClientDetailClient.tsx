'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getClientDetail, listPastEnrollmentsForClient } from '@/lib/queries/client-detail'
import type { PastEnrollment } from '@/lib/queries/client-detail'
import { listSalesForClient } from '@/lib/queries/sales'
import { listBalanceAfterBySaleIds } from '@/lib/queries/balance-transactions'
import { listTrainingTypeLabels } from '@/lib/queries/training-types'
import { deleteSale } from '@/lib/queries/sales'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import ClientModal from '@/components/ClientModal'
import SaleModal from '@/components/SaleModal'
import type { EditSaleSnapshot } from '@/components/SaleModal'
import { formatClientName, formatSaleDatetime } from '@/lib/formatters'
import EnrollClientModal from '@/components/EnrollClientModal'
import type { Client, ClientSessionBalance, Sale } from '@/types'
import styles from './client-profile.module.css'

const DOW_LABELS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

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

type UpcomingEnrollment = {
  id: string
  class_id: string
  status: string
  classes: {
    ticket_type: string
    title: string | null
    starts_at: string
    duration_min: number
    trainers: { name: string } | null
    halls: { name: string } | null
  } | null
}


const PAYMENT_LABELS: Record<string, string> = {
  cash:          'Готівка',
  fop:           'ФОП',
  personal_card: 'Карта',
  deposit:       'Депозит',
}

const PAYMENT_CLASS: Record<string, string> = {
  cash:          'badgeCash',
  fop:           'badgeFop',
  personal_card: 'badgeCard',
  deposit:       'badgeDeposit',
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
  const [pastEnrollments, setPastEnrollments] = useState<PastEnrollment[]>([])
  const [pastTotal, setPastTotal] = useState(0)
  const [pastPage, setPastPage] = useState(0)

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

  const fetchSales = useCallback(async (page: number) => {
    const { data: salesData, count } = await listSalesForClient(supabase, id, page, SALES_PAGE_SIZE)
    if (page === 0) {
      setSales(salesData)
    } else {
      setSales(prev => [...prev, ...salesData])
    }
    setSalesTotal(count)

    if (salesData.length > 0) {
      const newMap = await listBalanceAfterBySaleIds(supabase, salesData.map(s => s.id))
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
      listTrainingTypeLabels(supabase).then(setTypeLabels),
      fetchAllClientData(),
      fetchSales(0),
      fetchPastEnrollments(0),
    ]).then(() => setLoading(false))
  }, [fetchAllClientData, fetchSales])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        fetchAllClientData()
        setSalesPage(0)
        fetchSales(0)
        setPastPage(0)
        fetchPastEnrollments(0)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchAllClientData, fetchSales, fetchPastEnrollments])

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
    <div className={styles.layout}>
      <Sidebar />
      <BottomNav />
      <main className={styles.main}><div className={styles.empty}>Завантаження...</div></main>
    </div>
  )

  if (fetchError || !client) return (
    <div className={styles.layout}>
      <Sidebar />
      <BottomNav />
      <main className={styles.main}><div className={styles.empty}>{fetchError ?? 'Клієнта не знайдено'}</div></main>
    </div>
  )

  const clientName = formatClientName(client)
  const balance = client.balance ?? 0

  return (
    <div className={styles.layout}>
      <Sidebar />
      <BottomNav />
      <main className={styles.main}>

        <div className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button className={styles.backBtn} onClick={() => router.push('/clients')}>
              ← Клієнти
            </button>
            <h1 className={styles.title}>
              {clientName || <span className={styles.noName}>Клієнт без імені</span>}
            </h1>
          </div>
          <button className={styles.btnEdit} onClick={() => setShowEditModal(true)}>
            Редагувати
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.topGrid}>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Контакти</h2>
              <dl className={styles.fields}>
                <div className={styles.field}>
                  <dt>Телефон</dt>
                  <dd>
                    {client.phone
                      ? <a href={`tel:${client.phone}`} className={styles.fieldLink}>{client.phone}</a>
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
              <h2 className={styles.cardTitle}>Депозит</h2>
              <div className={styles.balanceRow}>
                <span className={
                  balance > 0 ? styles.balancePos :
                  balance < 0 ? styles.balanceNeg :
                  styles.balanceZero
                }>
                  {balance.toLocaleString('uk-UA')} ₴
                </span>
                {balance < 0 && <span className={styles.warningBadge}>Від&apos;ємний депозит</span>}
              </div>
              {client.balance_updated_at && (
                <div className={styles.fieldMeta}>
                  Оновлено {new Date(client.balance_updated_at).toLocaleDateString('uk-UA')}
                </div>
              )}
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Залишок занять</h2>
              {sessionBalances.length === 0 ? (
                <div className={styles.emptySection}>
                  <span className={styles.empty2}>Немає активних занять</span>
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
                <h2 className={styles.cardTitle}>Постійні записи</h2>
                <button className={styles.btnPrimary} onClick={() => router.push('/schedule/templates')}>
                  Шаблони →
                </button>
              </div>
              {permanentEnrollments.length === 0 ? (
                <div className={styles.emptySection}>
                  <span className={styles.empty2}>Немає постійних записів</span>
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
                          {DOW_LABELS[s.day_of_week]} {timeStr} · {typeLabels[s.ticket_type] ?? s.ticket_type}
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
              <h2 className={styles.cardTitle}>Майбутні записи</h2>
              <button className={styles.btnPrimary} onClick={() => setShowEnrollModal(true)}>
                Записати на заняття
              </button>
            </div>
            {upcomingEnrollments.length === 0 ? (
              <div className={styles.emptySection}>
                <span className={styles.empty2}>Немає майбутніх записів</span>
              </div>
            ) : (
              <div className={styles.tableWrap}>
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
                          <td>{typeLabels[cls.ticket_type] ?? cls.ticket_type}{cls.title ? ` · ${cls.title}` : ''}</td>
                          <td>{cls.trainers?.name ?? <span className={styles.empty2}>—</span>}</td>
                          <td>{cls.halls?.name ?? <span className={styles.empty2}>—</span>}</td>
                          <td>
                            <button
                              className={styles.btnRowEdit}
                              onClick={() => router.push(`/schedule/${e.class_id}`)}
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
            )}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Минулі тренування</h2>
            {pastEnrollments.length === 0 ? (
              <div className={styles.emptySection}>
                <span className={styles.empty2}>Ще не було тренувань</span>
              </div>
            ) : (
              <>
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
                {pastEnrollments.length < pastTotal && (
                  <button className={styles.btnLoadMore} onClick={handleLoadMorePast}>
                    Завантажити ще ({pastTotal - pastEnrollments.length})
                  </button>
                )}
              </>
            )}
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Історія покупок</h2>
              <button className={styles.btnPrimary} onClick={() => setShowSaleModal(true)}>
                Записати продаж
              </button>
            </div>
            {sales.length === 0 ? (
              <div className={styles.emptySection}>
                <span className={styles.empty2}>Покупок ще не було</span>
              </div>
            ) : (
              <>
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
                          <td className={styles.dateCell}>
                            {formatSaleDatetime(s.created_at)}
                          </td>
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
                            {s.ticket_price != null ? `${s.ticket_price.toLocaleString('uk-UA')} ₴` : <span className={styles.empty2}>—</span>}
                          </td>
                          <td className={styles.numCell}>
                            {s.ticket_id != null && s.payment_method !== 'deposit'
                              ? `${s.price_paid.toLocaleString('uk-UA')} ₴`
                              : <span className={styles.empty2}>—</span>}
                          </td>
                          <td className={styles.numCell}>
                            {delta > 0
                              ? <span className={styles.deltaPos}>+{delta.toLocaleString('uk-UA')} ₴</span>
                              : delta < 0
                                ? <span className={styles.deltaNeg}>{delta.toLocaleString('uk-UA')} ₴</span>
                                : <span className={styles.empty2}>—</span>
                            }
                          </td>
                          <td className={styles.numCell}>
                            {balAfter !== undefined
                              ? <span className={balAfter >= 0 ? styles.deltaPos : styles.deltaNeg}>{balAfter.toLocaleString('uk-UA')} ₴</span>
                              : <span className={styles.empty2}>—</span>
                            }
                          </td>
                          <td>
                            <span className={`${styles.badge} ${styles[PAYMENT_CLASS[s.payment_method] ?? '']}`}>
                              {PAYMENT_LABELS[s.payment_method] ?? s.payment_method}
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
                                  price_paid: s.price_paid,
                                  amount_given: s.amount_given,
                                  payment_method: s.payment_method,
                                  notes: s.notes,
                                  created_at: s.created_at,
                                })}
                              >
                                Змінити
                              </button>
                              <button
                                className={styles.btnRowDel}
                                onClick={() => setDeleteId(s.id)}
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
                {sales.length < salesTotal && (
                  <button className={styles.btnLoadMore} onClick={handleLoadMore}>
                    Завантажити ще ({salesTotal - sales.length})
                  </button>
                )}
              </>
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
