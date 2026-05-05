'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import ClientModal from '@/components/features/ClientModal'
import SaleModal from '@/components/features/SaleModal'
import type { EditSaleSnapshot } from '@/components/features/SaleModal'
import { formatClientName, formatSaleDatetime } from '@/lib/formatters'
import type { Client, ClientSessionBalance, Sale } from '@/types'
import styles from './client-profile.module.css'

const supabase = createClient()

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

export default function ClientProfilePage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

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

  const fetchClient = useCallback(async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('id, first_name, last_name, phone, instagram_username, telegram_username, balance, credit_limit, balance_updated_at')
      .eq('id', id)
      .single()
    if (error || !data) { setFetchError('Клієнта не знайдено'); return }
    setClient(data as Client)
  }, [id])

  const fetchSessionBalances = useCallback(async () => {
    const { data } = await supabase
      .from('client_session_balances')
      .select('client_id, ticket_type, sessions_balance')
      .eq('client_id', id)
      .neq('sessions_balance', 0)
      .order('ticket_type')
    setSessionBalances((data as ClientSessionBalance[]) ?? [])
  }, [id])

  const fetchSales = useCallback(async (page: number) => {
    const from = page * SALES_PAGE_SIZE
    const to = from + SALES_PAGE_SIZE - 1
    const { data, count } = await supabase
      .from('sales')
      .select(
        'id, created_at, client_id, ticket_id, trainer_id, ticket_name, ticket_price, ticket_type, sessions, price_paid, amount_given, payment_method, notes, clients(first_name, last_name), tickets(name), trainers(name)',
        { count: 'exact' }
      )
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .range(from, to)

    const salesData = (data as Sale[]) ?? []
    if (page === 0) {
      setSales(salesData)
    } else {
      setSales(prev => [...prev, ...salesData])
    }
    setSalesTotal(count ?? 0)

    if (salesData.length > 0) {
      const saleIds = salesData.map(s => s.id)
      const { data: txData } = await supabase
        .from('balance_transactions')
        .select('related_sale_id, balance_after')
        .in('related_sale_id', saleIds)
        .order('created_at', { ascending: false })
      const newMap = new Map<string, number>()
      ;((txData ?? []) as { related_sale_id: string; balance_after: number }[])
        .filter(tx => tx.related_sale_id != null)
        .forEach(tx => { if (!newMap.has(tx.related_sale_id)) newMap.set(tx.related_sale_id, tx.balance_after) })
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
    supabase.from('training_types').select('code, label').then(({ data }) => {
      const map: Record<string, string> = {}
      for (const t of data ?? []) map[t.code] = t.label
      setTypeLabels(map)
    })
    Promise.all([fetchClient(), fetchSessionBalances(), fetchSales(0)]).then(() => setLoading(false))
  }, [fetchClient, fetchSessionBalances, fetchSales])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        fetchClient()
        fetchSessionBalances()
        setSalesPage(0)
        fetchSales(0)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchClient, fetchSessionBalances, fetchSales])

  function handleClientSaved() {
    setShowEditModal(false)
    fetchClient()
  }

  function handleSaleSaved() {
    setShowSaleModal(false)
    setEditingSale(null)
    setSalesPage(0)
    fetchSales(0)
    fetchSessionBalances()
    fetchClient()
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    setDeleteError('')
    const { data, error } = await supabase.rpc('delete_sale', { p_sale_id: deleteId })
    if (error || !data?.[0]?.success) {
      setDeleteError(error?.message ?? data?.[0]?.error_message ?? 'Помилка видалення')
      setDeleting(false)
      return
    }
    setDeleteId(null)
    setDeleting(false)
    setSalesPage(0)
    fetchSales(0)
    fetchSessionBalances()
    fetchClient()
  }

  function handleLoadMore() {
    const next = salesPage + 1
    setSalesPage(next)
    fetchSales(next)
  }

  if (loading) return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}><div className={styles.empty}>Завантаження...</div></main>
    </div>
  )

  if (fetchError || !client) return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}><div className={styles.empty}>{fetchError ?? 'Клієнта не знайдено'}</div></main>
    </div>
  )

  const clientName = formatClientName(client)
  const balance = client.balance ?? 0

  return (
    <div className={styles.layout}>
      <Sidebar />
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

          </div>

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
