'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { deleteStudioExpense } from '@/lib/queries/studio-expenses'
import type { StudioExpense } from '@/lib/queries/studio-expenses'
import { type TrainerPayment } from '@/lib/queries/trainer-rates'
import { getAccountingBalance, listReconciliationFeedPage, type ReconSaleRow, type FeedRow, type AccountBalance } from '@/lib/queries/accounting'
import { useRefs } from '@/contexts/RefsContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import DatePicker from '@/components/DatePicker'
import { formatMoney, formatDate } from '@/lib/formatters'
import { ArrowDownLeft, ArrowUpRight, ShoppingBag, TrendingUp, Trash2, Banknote, X } from 'lucide-react'
import { paymentLabel, paymentClass } from '@/lib/badges'
import { MSG } from '@/lib/messages'
import { toYMD } from '@/lib/dateUtils'
import type { PaymentMethod } from '@/types'
import FilterSelect from '@/components/ui/FilterSelect'
import styles from './accounting.module.css'

type SaleRow = ReconSaleRow
type FeedItem = FeedRow

const PAGE_SIZE = 50

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7]

function AccountingSkeleton({ isMobile }: { isMobile: boolean }) {
  if (isMobile) {
    return (
      <div className={styles.cardList} style={{ display: 'flex', flexDirection: 'column' }} role="status" aria-label="Завантаження...">
        {SKELETON_ROWS.slice(0, 6).map(i => (
          <div key={i} className={styles.card}>
            <div className={styles.cardMain}>
              <div className={styles.cardBody}>
                <div className={styles.cardRow1}>
                  <div className={`skeleton-bone ${styles.skelCardClient}`} style={{ width: `${40 - (i % 3) * 6}%` }} />
                  <div className={`skeleton-bone ${styles.skelCardAmt}`} />
                </div>
                <div className={styles.cardRow2}>
                  <div className={`skeleton-bone ${styles.skelCardTicket}`} />
                  <div className={`skeleton-bone ${styles.skelCardMethod}`} />
                </div>
                <div className={styles.cardRow3}>
                  <div className={`skeleton-bone ${styles.skelCardDatetime}`} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`data-table-wrap ${styles.tableDesktop}`} role="status" aria-label="Завантаження...">
      <table className="data-table" aria-hidden="true">
        <thead>
          <tr>
            <th className={styles.thCheck}></th>
            <th className={styles.thIcon}></th>
            <th className={styles.thDate}>Дата</th>
            <th className={styles.thClient}>Клієнт</th>
            <th className={styles.thTicket}>Абонемент / Коментар</th>
            <th className={styles.thPrice}>Ціна</th>
            <th className={styles.thDeposit}>На депозит</th>
            <th className={styles.thAmt}>Сума</th>
            <th className={styles.thMethod}>Метод</th>
          </tr>
        </thead>
        <tbody>
          {SKELETON_ROWS.map(i => (
            <tr key={i}>
              <td></td>
              <td></td>
              <td><div className={`skeleton-bone ${styles.skelDate}`} /></td>
              <td><div className="skeleton-bone" style={{ width: `${60 - (i % 3) * 8}%` }} /></td>
              <td><div className={`skeleton-bone ${styles.skelTicket}`} /></td>
              <td><div className={`skeleton-bone ${styles.skelPrice}`} /></td>
              <td><div className={`skeleton-bone ${styles.skelPrice}`} /></td>
              <td><div className={`skeleton-bone ${styles.skelPrice}`} /></td>
              <td><div className={`skeleton-bone ${styles.skelMethod}`} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function clientName(s: SaleRow): string {
  if (!s.clients) return '—'
  return [s.clients.first_name, s.clients.last_name].filter(Boolean).join(' ') || '—'
}

function fmtDatetime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const date = formatDate(d)
  const time = [String(d.getHours()).padStart(2, '0'), String(d.getMinutes()).padStart(2, '0')].join(':')
  return { date, time }
}

function saleRevenue(s: SaleRow): number {
  return s.ticket_id !== null ? s.price_paid : Math.max(0, s.amount_given)
}

function getToday(): string { return toYMD(new Date()) }

// Derive payment method and cash_holder from accountKey
function accountToFilter(accountKey: string): { method: PaymentMethod; holder: string | null } {
  if (accountKey === 'fop') return { method: 'fop', holder: null }
  if (accountKey === 'personal_card') return { method: 'personal_card', holder: null }
  return { method: 'cash', holder: accountKey }
}

export default function AccountingPage() {
  const { trainers } = useRefs()
  const isMobile = useIsMobile()
  const [dateFrom,    setDateFrom]    = useState<string>('')
  const [dateTo,      setDateTo]      = useState(getToday)
  const [accountKey,  setAccountKey]  = useState<string>('fop')
  const [feed,        setFeed]        = useState<FeedItem[]>([])
  const [feedCount,   setFeedCount]   = useState(0)
  const [page,        setPage]        = useState(0)
  const [balances,    setBalances]    = useState<AccountBalance[]>([])
  const [loading,     setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [checked,     setChecked]     = useState<Set<string>>(new Set())

  function toggleChecked(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const accountOptions = useMemo(() => [
    { value: 'fop',           label: 'ФОП' },
    { value: 'personal_card', label: 'Картка' },
    ...trainers.filter(t => t.is_active).map(t => ({ value: t.id, label: t.name })),
  ], [trainers])

  // Баланси ВСІХ рахунків — за вибраний період (без меж дат = вся історія).
  // Рахує БД, по одному виклику на рахунок (паралельно).
  const fetchBalances = useCallback(async (accounts: { value: string; label: string }[], from: string, to: string) => {
    const results = await Promise.all(
      accounts.map(async a => {
        const { method, holder } = accountToFilter(a.value)
        const bal = await getAccountingBalance(supabase, { method, holder, from, to })
        return { key: a.value, label: a.label, ...bal }
      })
    )
    const failed = results.find(r => r.error)
    if (failed?.error) { setError(failed.error); return }
    setBalances(results)
  }, [])

  useEffect(() => { fetchBalances(accountOptions, dateFrom, dateTo) }, [accountOptions, dateFrom, dateTo, fetchBalances])

  // Feed — лише для вибраного рахунку; фільтр впливає тільки на контент таблиці.
  const fetchFeed = useCallback(async (from: string, to: string, key: string) => {
    setLoading(true)
    setError(null)
    setPage(0)
    const { method, holder } = accountToFilter(key)
    const feedRes = await listReconciliationFeedPage(supabase, { method, holder, from, to }, 0, PAGE_SIZE)
    if (feedRes.error) { setError(feedRes.error); setLoading(false); return }
    setFeed(feedRes.rows)
    setFeedCount(feedRes.count)
    setLoading(false)
  }, [])

  useEffect(() => { fetchFeed(dateFrom, dateTo, accountKey) }, [dateFrom, dateTo, accountKey, fetchFeed])

  async function loadMore() {
    const next = page + 1
    setLoadingMore(true)
    const { method, holder } = accountToFilter(accountKey)
    const feedRes = await listReconciliationFeedPage(supabase, { method, holder, from: dateFrom, to: dateTo }, next, PAGE_SIZE)
    if (!feedRes.error) {
      setFeed(prev => [...prev, ...feedRes.rows])
      setFeedCount(feedRes.count)
      setPage(next)
    }
    setLoadingMore(false)
  }

  async function handleDeleteExpense(id: string) {
    await deleteStudioExpense(supabase, id)
    setFeed(prev => prev.filter(i => i.data.id !== id))
    setFeedCount(c => Math.max(0, c - 1))
  }

  const saleIds = useMemo(() => feed.filter(i => i.kind === 'sale').map(i => i.data.id), [feed])
  const allChecked = saleIds.length > 0 && saleIds.every(id => checked.has(id))
  const someChecked = !allChecked && saleIds.some(id => checked.has(id))

  function toggleAll() {
    if (allChecked) setChecked(new Set())
    else setChecked(new Set(saleIds))
  }

  return (
    <div className="page-layout">
      <Sidebar />
      <BottomNav />
      <main className="page-main">
        <div className="page-head">
          <div className={styles.topbar}>
            <h1 className="page-title">Звітність</h1>
          </div>

          <div className={styles.filters}>
            <FilterSelect
              value={accountKey}
              onChange={v => setAccountKey(v || 'fop')}
              placeholder="Рахунок"
              options={accountOptions}
            />
            <div className={styles.dateGroup}>
              <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="від початку" />
              <span className={styles.dateSep}>—</span>
              <DatePicker value={dateTo} onChange={setDateTo} />
              {dateFrom && (
                <button className={styles.resetBtn} onClick={() => setDateFrom('')} title="Скинути">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="page-body">
          {!error && balances.length > 0 && (
            <div className={styles.balanceBlock}>
              {balances.map(b => {
                const active = b.key === accountKey
                return (
                  <button
                    key={b.key}
                    type="button"
                    className={`${styles.balanceCard} ${active ? styles.balanceCardActive : ''}`}
                    onClick={() => setAccountKey(b.key)}
                    aria-pressed={active}
                  >
                    <span className={styles.balanceCardLabel}>{b.label}</span>
                    <span className={`${styles.balanceCardVal} ${b.balance > 0 ? styles.balanceBigPos : b.balance < 0 ? styles.balanceBigNeg : ''}`}>
                      {formatMoney(b.balance)}
                    </span>
                    <span className={styles.balanceCardMeta}>
                      <span>+{formatMoney(b.income)}</span>
                      <span>−{formatMoney(b.outcome)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <div className={styles.content}>
            {loading ? (
              <AccountingSkeleton isMobile={isMobile} />
            ) : error ? (
              <div className={styles.empty}>Помилка: {error}</div>
            ) : feed.length === 0 ? (
              <div className={styles.empty}>{MSG.empty.salesPeriod}</div>
            ) : (
              <>
                {/* Desktop table — рендеримо лише на desktop (інакше дублюємо DOM) */}
                {!isMobile && (
                <div className={`data-table-wrap ${styles.tableDesktop}`}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className={styles.thCheck}>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={allChecked}
                            ref={el => { if (el) el.indeterminate = someChecked }}
                            onChange={toggleAll}
                          />
                        </th>
                        <th className={styles.thIcon}></th>
                        <th className={styles.thDate}>Дата</th>
                        <th className={styles.thClient}>Клієнт</th>
                        <th className={styles.thTicket}>Абонемент / Коментар</th>
                        <th className={styles.thPrice}>Ціна</th>
                        <th className={styles.thDeposit}>На депозит</th>
                        <th className={styles.thAmt}>Сума</th>
                        <th className={styles.thMethod}>Метод</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feed.map(item => {
                        if (item.kind === 'sale') {
                          const s = item.data
                          const { date, time } = fmtDatetime(s.created_at)
                          const amt = saleRevenue(s)
                          const depDelta = s.amount_given - s.price_paid
                          const hasDeposit = s.ticket_id !== null && depDelta > 0
                          const isChecked = checked.has(s.id)
                          return (
                            <tr key={`sale-${s.id}`} className={isChecked ? styles.rowChecked : ''} onClick={() => toggleChecked(s.id)}>
                              <td className={styles.checkCell}>
                                <input
                                  type="checkbox"
                                  className={styles.checkbox}
                                  checked={isChecked}
                                  onChange={() => toggleChecked(s.id)}
                                  onClick={e => e.stopPropagation()}
                                />
                              </td>
                              <td className={styles.iconCell}>
                                {s.payment_method === 'deposit'
                                  ? <ArrowUpRight size={16} className={styles.iconDeposit} />
                                  : <ArrowDownLeft size={16} className={styles.iconIncome} />
                                }
                              </td>
                              <td>
                                <div className={styles.dateCell}>
                                  <span className={styles.dateMain}>{date}</span>
                                  <span className={styles.dateTime}>{time}</span>
                                </div>
                              </td>
                              <td><span className={styles.clientName}>{clientName(s)}</span></td>
                              <td className={styles.ticketCell}>
                                {s.ticket_name
                                  ? <span className={styles.ticketName}>{s.ticket_name}</span>
                                  : <span className={styles.zero}>—</span>
                                }
                              </td>
                              <td className={styles.priceCell}>
                                {s.ticket_price != null
                                  ? formatMoney(s.ticket_price)
                                  : <span className={styles.zero}>—</span>
                                }
                              </td>
                              <td className={styles.depositCell}>
                                {hasDeposit
                                  ? <span className={styles.depositVal}>+{formatMoney(depDelta)}</span>
                                  : <span className={styles.zero}>—</span>
                                }
                              </td>
                              <td className={`${styles.amtCell} ${amt > 0 ? '' : styles.zero}`}>
                                {amt > 0 ? formatMoney(s.amount_given) : '—'}
                              </td>
                              <td>
                                <span className={paymentClass(s.payment_method)}>
                                  {paymentLabel(s.payment_method)}
                                </span>
                              </td>
                            </tr>
                          )
                        } else if (item.kind === 'expense') {
                          const e = item.data
                          const { date, time } = fmtDatetime(e.created_at)
                          const isExpense = e.direction === 'expense'
                          return (
                            <tr key={`exp-${e.id}`} className={`${styles.expenseRow} ${checked.has(e.id) ? styles.rowChecked : ''}`} onClick={() => toggleChecked(e.id)}>
                              <td className={styles.checkCell}>
                                <input
                                  type="checkbox"
                                  className={styles.checkbox}
                                  checked={checked.has(e.id)}
                                  onChange={() => toggleChecked(e.id)}
                                  onClick={ev => ev.stopPropagation()}
                                />
                              </td>
                              <td className={styles.iconCell}>
                                {isExpense
                                  ? <ShoppingBag size={16} className={styles.iconExpense} />
                                  : <TrendingUp size={16} className={styles.iconOtherIncome} />
                                }
                              </td>
                              <td>
                                <div className={styles.dateCell}>
                                  <span className={styles.dateMain}>{date}</span>
                                  <span className={styles.dateTime}>{time}</span>
                                </div>
                              </td>
                              <td>
                                <span className={`${styles.clientName} ${styles.expenseLabel}`}>
                                  {isExpense ? 'Витрата студії' : 'Дохід студії'}
                                </span>
                              </td>
                              <td className={styles.ticketCell}>
                                {e.description
                                  ? <span className={styles.ticketName}>{e.description}</span>
                                  : <span className={styles.zero}>—</span>
                                }
                              </td>
                              <td className={styles.priceCell}><span className={styles.zero}>—</span></td>
                              <td className={styles.depositCell}><span className={styles.zero}>—</span></td>
                              <td className={`${styles.amtCell} ${isExpense ? styles.amtExpense : styles.amtOtherIncome}`}>
                                {isExpense ? `−${formatMoney(e.amount)}` : formatMoney(e.amount)}
                              </td>
                              <td>
                                <div className={styles.expenseMethodRow}>
                                  <span className={paymentClass(e.payment_method as PaymentMethod)}>
                                    {paymentLabel(e.payment_method as PaymentMethod)}
                                  </span>
                                  <button
                                    className={styles.deleteExpenseBtn}
                                    onClick={() => handleDeleteExpense(e.id)}
                                    title="Видалити"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        } else {
                          const p = item.data
                          const { date, time } = fmtDatetime(p.created_at)
                          const method = (p.payment_method ?? 'cash') as PaymentMethod
                          return (
                            <tr key={`pay-${p.id}`} className={styles.expenseRow}>
                              <td className={styles.checkCell}></td>
                              <td className={styles.iconCell}>
                                <Banknote size={16} className={styles.iconExpense} />
                              </td>
                              <td>
                                <div className={styles.dateCell}>
                                  <span className={styles.dateMain}>{date}</span>
                                  <span className={styles.dateTime}>{time}</span>
                                </div>
                              </td>
                              <td>
                                <span className={`${styles.clientName} ${styles.expenseLabel}`}>
                                  Виплата ЗП
                                </span>
                              </td>
                              <td className={styles.ticketCell}>
                                {p.trainers?.name
                                  ? <span className={styles.trainerName}>{p.trainers.name}</span>
                                  : <span className={styles.zero}>—</span>
                                }
                              </td>
                              <td className={styles.priceCell}><span className={styles.zero}>—</span></td>
                              <td className={styles.depositCell}><span className={styles.zero}>—</span></td>
                              <td className={`${styles.amtCell} ${styles.amtExpense}`}>
                                −{formatMoney(Number(p.paid_amount))}
                              </td>
                              <td>
                                <div className={styles.expenseMethodRow}>
                                  <span className={paymentClass(method)}>
                                    {paymentLabel(method)}
                                  </span>
                                  <span className={`badge ${p.payment_type === 'advance' ? 'badge-type' : 'badge-completed'}`}>
                                    {p.payment_type === 'advance' ? 'Аванс' : 'Фінальна'}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )
                        }
                      })}
                    </tbody>
                  </table>
                </div>
                )}

                {/* Mobile cards — лише на mobile */}
                {isMobile && (
                <div className={styles.cardList}>
                  {feed.map(item => {
                    if (item.kind === 'sale') {
                      const s = item.data
                      const { date, time } = fmtDatetime(s.created_at)
                      const amt = saleRevenue(s)
                      const depDelta = s.amount_given - s.price_paid
                      const hasDeposit = s.ticket_id !== null && depDelta > 0
                      const isChecked = checked.has(s.id)
                      return (
                        <div key={`sale-${s.id}`} className={`${styles.card} ${isChecked ? styles.cardChecked : ''}`} onClick={() => toggleChecked(s.id)}>
                          <div className={styles.cardMain}>
                            <input
                              type="checkbox"
                              className={styles.checkbox}
                              checked={isChecked}
                              onChange={() => toggleChecked(s.id)}
                              onClick={e => e.stopPropagation()}
                            />
                            <div className={styles.cardBody}>
                              <div className={styles.cardRow1}>
                                <span className={styles.cardClient}>{clientName(s)}</span>
                                <span className={`${styles.cardAmt} ${amt === 0 ? styles.zero : ''}`}>
                                  {amt > 0 ? formatMoney(s.amount_given) : '—'}
                                </span>
                              </div>
                              <div className={styles.cardRow2}>
                                <span className={styles.cardTicket}>
                                  {s.ticket_name ?? <span className={styles.zero}>Депозит</span>}
                                </span>
                                <span className={paymentClass(s.payment_method)}>
                                  {paymentLabel(s.payment_method)}
                                </span>
                              </div>
                              <div className={styles.cardRow3}>
                                <span className={styles.cardDatetime}>{date} · {time}</span>
                                {hasDeposit && (
                                  <span className={styles.depositHint}>+{formatMoney(depDelta)} депозит</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    } else if (item.kind === 'expense') {
                      const e = item.data
                      const { date, time } = fmtDatetime(e.created_at)
                      const isExpense = e.direction === 'expense'
                      return (
                        <div key={`exp-${e.id}`} className={`${styles.card} ${styles.expenseCard} ${checked.has(e.id) ? styles.cardChecked : ''}`} onClick={() => toggleChecked(e.id)}>
                          <div className={styles.cardMain}>
                            <input
                              type="checkbox"
                              className={styles.checkbox}
                              checked={checked.has(e.id)}
                              onChange={() => toggleChecked(e.id)}
                              onClick={ev => ev.stopPropagation()}
                            />
                            <div className={isExpense ? styles.iconExpense : styles.iconOtherIncome}>
                              {isExpense
                                ? <ShoppingBag size={16} />
                                : <TrendingUp size={16} />
                              }
                            </div>
                            <div className={styles.cardBody}>
                              <div className={styles.cardRow1}>
                                <span className={`${styles.cardClient} ${styles.expenseLabel}`}>
                                  {isExpense ? 'Витрата студії' : 'Дохід студії'}
                                </span>
                                <span className={`${styles.cardAmt} ${isExpense ? styles.amtExpense : styles.amtOtherIncome}`}>
                                  {isExpense ? `−${formatMoney(e.amount)}` : formatMoney(e.amount)}
                                </span>
                              </div>
                              <div className={styles.cardRow2}>
                                <span className={styles.cardTicket}>{e.description ?? '—'}</span>
                                <span className={paymentClass(e.payment_method as PaymentMethod)}>
                                  {paymentLabel(e.payment_method as PaymentMethod)}
                                </span>
                              </div>
                              <div className={styles.cardRow3}>
                                <span className={styles.cardDatetime}>{date} · {time}</span>
                                <button
                                  className={styles.deleteExpenseBtn}
                                  onClick={() => handleDeleteExpense(e.id)}
                                  title="Видалити"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    } else {
                      const p = item.data
                      const { date, time } = fmtDatetime(p.created_at)
                      const method = (p.payment_method ?? 'cash') as PaymentMethod
                      return (
                        <div key={`pay-${p.id}`} className={`${styles.card} ${styles.expenseCard}`}>
                          <div className={styles.cardMain}>
                            <div className={styles.iconExpense}>
                              <Banknote size={16} />
                            </div>
                            <div className={styles.cardBody}>
                              <div className={styles.cardRow1}>
                                <span className={`${styles.cardClient} ${styles.expenseLabel}`}>
                                  Виплата ЗП
                                </span>
                                <span className={`${styles.cardAmt} ${styles.amtExpense}`}>
                                  −{formatMoney(Number(p.paid_amount))}
                                </span>
                              </div>
                              <div className={styles.cardRow2}>
                                <span className={styles.cardTicket}>{p.trainers?.name ?? '—'}</span>
                                <span className={paymentClass(method)}>{paymentLabel(method)}</span>
                              </div>
                              <div className={styles.cardRow3}>
                                <span className={styles.cardDatetime}>{date} · {time}</span>
                                <span className={`badge ${p.payment_type === 'advance' ? 'badge-type' : 'badge-completed'}`}>
                                  {p.payment_type === 'advance' ? 'Аванс' : 'Фінальна'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    }
                  })}
                </div>
                )}

                {feed.length < feedCount && (
                  <div className={styles.loadMoreWrap}>
                    <button className={styles.loadMoreBtn} onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? 'Завантаження…' : `Показати ще (${feedCount - feed.length})`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
