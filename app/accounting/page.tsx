'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { listActiveTrainers } from '@/lib/queries/trainers'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import DatePicker from '@/components/DatePicker'
import { formatMoney, formatDate } from '@/lib/formatters'
import { paymentLabel, paymentClass } from '@/lib/badges'
import { MSG } from '@/lib/messages'
import { isoToYMD, toYMD } from '@/lib/dateUtils'
import type { PaymentMethod, Trainer } from '@/types'
import styles from './accounting.module.css'

type SaleRow = {
  id: string
  created_at: string
  price_paid: number
  amount_given: number
  payment_method: PaymentMethod
  ticket_id: string | null
  ticket_name: string | null
  trainer_id: string | null
  clients: { first_name: string | null; last_name: string | null } | null
  trainers: { name: string } | null
}

type PaymentFilter = 'all' | 'cash' | 'fop' | 'personal_card' | 'deposit'

const PAYMENT_FILTERS: { value: PaymentFilter; label: string }[] = [
  { value: 'all',           label: 'Всі' },
  { value: 'cash',          label: 'Готівка' },
  { value: 'fop',           label: 'ФОП' },
  { value: 'personal_card', label: 'Картка' },
  { value: 'deposit',       label: 'Депозит' },
]

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

function revenue(s: SaleRow): number {
  return s.ticket_id !== null ? s.price_paid : Math.max(0, s.amount_given)
}

function getToday(): string    { return toYMD(new Date()) }
function getMonthStart(): string {
  const d = new Date()
  return toYMD(new Date(d.getFullYear(), d.getMonth(), 1))
}
function getWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return toYMD(d)
}

export default function AccountingPage() {
  const [dateFrom, setDateFrom] = useState(getMonthStart)
  const [dateTo,   setDateTo]   = useState(getToday)
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')
  const [trainerFilter, setTrainerFilter] = useState<string>('all')
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [sales,    setSales]    = useState<SaleRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [checked,  setChecked]  = useState<Set<string>>(new Set())

  function toggleChecked(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  useEffect(() => {
    listActiveTrainers(supabase).then(setTrainers)
  }, [])

  const fetchSales = useCallback(async (from: string, to: string) => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('sales')
      .select('id, created_at, price_paid, amount_given, payment_method, ticket_id, ticket_name, trainer_id, clients(first_name, last_name), trainers(name)')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`)
      .order('created_at', { ascending: false })
    if (error) { setError(error.message); setLoading(false); return }
    setSales((data ?? []) as SaleRow[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchSales(dateFrom, dateTo) }, [dateFrom, dateTo, fetchSales])

  useEffect(() => {
    if (paymentFilter !== 'cash') setTrainerFilter('all')
  }, [paymentFilter])

  const filtered = useMemo(() => {
    let s = sales
    if (paymentFilter !== 'all') s = s.filter(r => r.payment_method === paymentFilter)
    if (paymentFilter === 'cash' && trainerFilter !== 'all') {
      s = s.filter(r => r.trainer_id === trainerFilter)
    }
    return s
  }, [sales, paymentFilter, trainerFilter])

  const totals = useMemo(() => {
    const t = { cash: 0, fop: 0, card: 0, deposit: 0 }
    for (const s of filtered) {
      const amt = revenue(s)
      if (s.payment_method === 'cash')               t.cash    += amt
      else if (s.payment_method === 'fop')           t.fop     += amt
      else if (s.payment_method === 'personal_card') t.card    += amt
      else if (s.payment_method === 'deposit')       t.deposit += amt
    }
    return t
  }, [filtered])

  const grandTotal = totals.cash + totals.fop + totals.card

  function setPreset(from: string, to: string) { setDateFrom(from); setDateTo(to) }

  const todayStr = getToday()
  const weekStr  = getWeekStart()
  const monthStr = getMonthStart()
  const activePreset =
    dateFrom === todayStr  && dateTo === todayStr  ? 'today'  :
    dateFrom === weekStr   && dateTo === todayStr  ? 'week'   :
    dateFrom === monthStr  && dateTo === todayStr  ? 'month'  : null

  return (
    <div className={styles.layout}>
      <Sidebar />
      <BottomNav />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className="page-title">Звітність</h1>
          <a href="/accounting/trainers" className={styles.trainerReportLink}>
            Звіт по тренерах →
          </a>
        </div>

        <div className={styles.filters}>
          <div className={styles.presets}>
            <button className={`${styles.preset} ${activePreset === 'today' ? styles.presetActive : ''}`}
              onClick={() => setPreset(todayStr, todayStr)}>Сьогодні</button>
            <button className={`${styles.preset} ${activePreset === 'week'  ? styles.presetActive : ''}`}
              onClick={() => setPreset(weekStr, todayStr)}>Цей тиждень</button>
            <button className={`${styles.preset} ${activePreset === 'month' ? styles.presetActive : ''}`}
              onClick={() => setPreset(monthStr, todayStr)}>Цей місяць</button>
          </div>
          <div className={styles.dateRange}>
            <span className={styles.dateLabel}>Від</span>
            <DatePicker value={dateFrom} onChange={setDateFrom} />
            <span className={styles.dateLabel}>До</span>
            <DatePicker value={dateTo} onChange={setDateTo} />
          </div>
          <div className={styles.paymentTabs}>
            {PAYMENT_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                className={`${styles.preset} ${paymentFilter === value ? styles.presetActive : ''}`}
                onClick={() => setPaymentFilter(value)}
              >{label}</button>
            ))}
          </div>
          {paymentFilter === 'cash' && trainers.length > 0 && (
            <select
              className={styles.trainerSelect}
              value={trainerFilter}
              onChange={e => setTrainerFilter(e.target.value)}
            >
              <option value="all">Всі тренери</option>
              {trainers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Totals cards */}
        {!loading && !error && (
          <div className={styles.totalsBar}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Готівка</div>
              <div className={`${styles.summaryValue} ${totals.cash > 0 ? styles.valCash : styles.summaryZero}`}>{formatMoney(totals.cash)}</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>ФОП</div>
              <div className={`${styles.summaryValue} ${totals.fop > 0 ? styles.valFop : styles.summaryZero}`}>{formatMoney(totals.fop)}</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Картка</div>
              <div className={`${styles.summaryValue} ${totals.card > 0 ? styles.valCard : styles.summaryZero}`}>{formatMoney(totals.card)}</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Депозит</div>
              <div className={`${styles.summaryValue} ${totals.deposit > 0 ? styles.valDeposit : styles.summaryZero}`}>{formatMoney(totals.deposit)}</div>
            </div>
            <div className={`${styles.summaryCard} ${styles.summaryCardTotal}`}>
              <div className={styles.summaryLabel}>Надходження</div>
              <div className={styles.summaryValue}>{formatMoney(grandTotal)}</div>
            </div>
          </div>
        )}

        <div className={styles.content}>
          {loading ? (
            <div className="loading-dots"><span /><span /><span /></div>
          ) : error ? (
            <div className={styles.empty}>Помилка: {error}</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>{MSG.empty.salesPeriod}</div>
          ) : (
            <>
              {/* Desktop table */}
              <div className={`data-table-wrap ${styles.tableDesktop}`}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className={styles.thCheck}></th>
                      <th className={styles.thDate}>Дата</th>
                      <th>Клієнт і операція</th>
                      <th className={styles.thAmt}>Сума</th>
                      <th className={styles.thMethod}>Метод</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(s => {
                      const { date, time } = fmtDatetime(s.created_at)
                      const amt = revenue(s)
                      const depDelta = s.amount_given - s.price_paid
                      const hasDeposit = s.ticket_id !== null && depDelta > 0
                      const isChecked = checked.has(s.id)
                      return (
                        <tr key={s.id} className={isChecked ? styles.rowChecked : ''} onClick={() => toggleChecked(s.id)}>
                          <td className={styles.checkCell}>
                            <input
                              type="checkbox"
                              className={styles.checkbox}
                              checked={isChecked}
                              onChange={() => toggleChecked(s.id)}
                              onClick={e => e.stopPropagation()}
                            />
                          </td>
                          <td>
                            <div className={styles.dateCell}>
                              <span className={styles.dateMain}>{date}</span>
                              <span className={styles.dateTime}>{time}</span>
                            </div>
                          </td>
                          <td>
                            <div className={styles.clientCell}>
                              <span className={styles.clientName}>{clientName(s)}</span>
                              {s.ticket_name && (
                                <span className={styles.ticketName}>{s.ticket_name}</span>
                              )}
                              {hasDeposit && (
                                <span className={styles.depositHint}>з них {formatMoney(depDelta)} на депозит</span>
                              )}
                            </div>
                          </td>
                          <td className={`${styles.amtCell} ${amt > 0 ? '' : styles.zero}`}>
                            {amt > 0 ? formatMoney(s.amount_given) : '—'}
                          </td>
                          <td>
                            <span className={`${styles.badge} ${styles[paymentClass(s.payment_method)]}`}>
                              {paymentLabel(s.payment_method)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className={styles.cardList}>
                {filtered.map(s => {
                  const { date, time } = fmtDatetime(s.created_at)
                  const amt = revenue(s)
                  const depDelta = s.amount_given - s.price_paid
                  const hasDeposit = s.ticket_id !== null && depDelta > 0
                  return (
                    <div key={s.id} className={`${styles.card} ${checked.has(s.id) ? styles.cardChecked : ''}`} onClick={() => toggleChecked(s.id)}>
                      <div className={styles.cardRow}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={checked.has(s.id)}
                          onChange={() => toggleChecked(s.id)}
                          onClick={e => e.stopPropagation()}
                        />
                        <span className={styles.cardClient}>{clientName(s)}</span>
                        <span className={styles.cardAmt}>{amt > 0 ? formatMoney(s.amount_given) : '—'}</span>
                      </div>
                      <div className={styles.cardMeta}>
                        <span>{date} · {time}</span>
                        <span className={styles.cardMetaDot}>·</span>
                        <span className={`${styles.badge} ${styles[paymentClass(s.payment_method)]}`}>
                          {paymentLabel(s.payment_method)}
                        </span>
                      </div>
                      {s.ticket_name && (
                        <div className={styles.cardTicket}>{s.ticket_name}</div>
                      )}
                      {hasDeposit && (
                        <div className={styles.depositHint}>з них {formatMoney(depDelta)} на депозит</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
