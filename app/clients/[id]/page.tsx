'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import ClientModal from '@/components/ClientModal'
import BalanceAdjustModal from '@/components/BalanceAdjustModal'
import SaleModal from '@/components/SaleModal'
import { formatClientName } from '@/lib/formatters'
import type { Client, ClientSessionBalance, Sale } from '@/types'
import styles from './client-profile.module.css'

const supabase = createClient()

const TICKET_TYPE_LABELS: Record<string, string> = {
  group:           'Групові',
  individual:      'Індивідуальні',
  individualduo:   'Індивід. дует',
  individualtrio:  'Індивід. тріо',
  hallrental:      'Оренда залу',
  smallhallrental: 'Мала зала',
  pylonrental:     'Пілон',
  striprental:     'Стрип',
}

const PAYMENT_LABELS: Record<string, string> = {
  cash:          'Готівка',
  fop:           'ФОП',
  personal_card: 'Карта',
}

const TX_LABELS: Record<string, string> = {
  purchase:         'Покупка',
  deposit_topup:    'Поповнення',
  deduction:        'Списання',
  refund:           'Повернення',
  adjustment:       'Коригування',
  admin_adjustment: 'Коригування',
}

interface Transaction {
  id: string
  amount: number
  transaction_type: string
  balance_before: number
  balance_after: number
  description: string | null
  created_at: string
}

const SALES_PAGE_SIZE = 20

export default function ClientProfilePage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [sessionBalances, setSessionBalances] = useState<ClientSessionBalance[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [salesTotal, setSalesTotal] = useState(0)
  const [salesPage, setSalesPage] = useState(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [txOpen, setTxOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showBalanceModal, setShowBalanceModal] = useState(false)
  const [showSaleModal, setShowSaleModal] = useState(false)

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
    if (page === 0) {
      setSales((data as Sale[]) ?? [])
    } else {
      setSales(prev => [...prev, ...((data as Sale[]) ?? [])])
    }
    setSalesTotal(count ?? 0)
  }, [id])

  const fetchTransactions = useCallback(async () => {
    const { data } = await supabase
      .from('balance_transactions')
      .select('id, amount, transaction_type, balance_before, balance_after, description, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(10)
    setTransactions(data ?? [])
  }, [id])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchClient(), fetchSessionBalances(), fetchSales(0)]).then(() => setLoading(false))
  }, [fetchClient, fetchSessionBalances, fetchSales])

  function handleClientSaved() {
    setShowEditModal(false)
    fetchClient()
  }

  function handleBalanceSaved() {
    setShowBalanceModal(false)
    fetchClient()
    fetchTransactions()
  }

  function handleSaleSaved() {
    setShowSaleModal(false)
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

  function handleTxToggle() {
    if (!txOpen && transactions.length === 0) fetchTransactions()
    setTxOpen(v => !v)
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
  const creditLimit = client.credit_limit ?? 10000

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
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Депозит</h2>
                <button className={styles.btnSecondary} onClick={() => setShowBalanceModal(true)}>
                  Поповнити / Коригувати
                </button>
              </div>
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
              <div className={styles.fieldMeta}>
                Кредитний ліміт: −{creditLimit.toLocaleString('uk-UA')} ₴
                {client.balance_updated_at && (
                  <> · Оновлено {new Date(client.balance_updated_at).toLocaleDateString('uk-UA')}</>
                )}
              </div>
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Залишок занять</h2>
              {sessionBalances.length === 0 ? (
                <div className={styles.emptySection}>
                  <span className={styles.empty2}>Немає активних занять</span>
                  <button className={styles.btnPrimary} onClick={() => setShowSaleModal(true)}>
                    Записати продаж
                  </button>
                </div>
              ) : (
                <div className={styles.sessionCards}>
                  {sessionBalances.map(b => (
                    <div key={b.ticket_type} className={styles.sessionCard}>
                      <span className={styles.sessionType}>
                        {TICKET_TYPE_LABELS[b.ticket_type] ?? b.ticket_type}
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
                        <th>Абонемент</th>
                        <th>Занять</th>
                        <th>Ціна</th>
                        <th>Оплачено</th>
                        <th>Спосіб</th>
                        <th>Тренер</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map(s => (
                        <tr key={s.id}>
                          <td className={styles.dateCell}>
                            {new Date(s.created_at).toLocaleDateString('uk-UA')}
                          </td>
                          <td>
                            {s.ticket_name ?? <span className={styles.depositLabel}>Поповнення депозиту</span>}
                          </td>
                          <td>{s.sessions ?? '—'}</td>
                          <td>{s.ticket_price != null ? `${(s.ticket_price / 100).toLocaleString('uk-UA')} ₴` : '—'}</td>
                          <td>{s.price_paid.toLocaleString('uk-UA')} ₴</td>
                          <td>{PAYMENT_LABELS[s.payment_method] ?? s.payment_method}</td>
                          <td>{s.trainers?.name ?? <span className={styles.empty2}>—</span>}</td>
                        </tr>
                      ))}
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

          <section className={styles.card}>
            <button className={styles.accordionToggle} onClick={handleTxToggle} aria-expanded={txOpen}>
              <span>Транзакції депозиту</span>
              <span className={styles.accordionIcon}>{txOpen ? '▲' : '▼'}</span>
            </button>
            {txOpen && (
              transactions.length === 0 ? (
                <div className={styles.emptySection}>
                  <span className={styles.empty2}>Транзакцій ще не було</span>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Тип</th>
                        <th>Сума</th>
                        <th>Баланс після</th>
                        <th>Опис</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map(tx => (
                        <tr key={tx.id}>
                          <td className={styles.dateCell}>
                            {new Date(tx.created_at).toLocaleDateString('uk-UA')}
                          </td>
                          <td>{TX_LABELS[tx.transaction_type] ?? tx.transaction_type}</td>
                          <td>
                            <span className={tx.amount > 0 ? styles.balancePos : styles.balanceNeg}>
                              {tx.amount > 0 ? '+' : ''}{Number(tx.amount).toLocaleString('uk-UA')} ₴
                            </span>
                          </td>
                          <td>{Number(tx.balance_after).toLocaleString('uk-UA')} ₴</td>
                          <td className={styles.txDesc}>{tx.description ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
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

      {showBalanceModal && (
        <BalanceAdjustModal
          client={client}
          onClose={() => setShowBalanceModal(false)}
          onSaved={handleBalanceSaved}
        />
      )}

      {showSaleModal && (
        <SaleModal
          onClose={() => setShowSaleModal(false)}
          onSaved={handleSaleSaved}
        />
      )}
    </div>
  )
}
