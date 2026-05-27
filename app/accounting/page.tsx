'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { listSalesForAccounting } from '@/lib/queries/sales'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import DatePicker from '@/components/DatePicker'
import { formatMoney } from '@/lib/formatters'
import { MSG } from '@/lib/messages'
import { isoToYMD, toYMD } from '@/lib/dateUtils'
import type { PaymentMethod } from '@/types'
import styles from './accounting.module.css'


type SaleRow = {
  created_at: string
  price_paid: number
  amount_given: number
  payment_method: PaymentMethod
  ticket_id: string | null
}

type Totals = { cash: number; fop: number; card: number; deposit: number }
type DayRow = Totals & { date: string; real: number }

function toDateKey(iso: string): string {
  return isoToYMD(iso)
}

// Ticket sale: price_paid = real money. Deposit top-up (no ticket): amount_given = real money.
function revenue(s: SaleRow): number {
  return s.ticket_id !== null ? s.price_paid : Math.max(0, s.amount_given)
}

function aggregate(sales: SaleRow[]): { rows: DayRow[]; totals: Totals & { real: number } } {
  const map = new Map<string, Totals>()
  for (const s of sales) {
    const key = toDateKey(s.created_at)
    const d = map.get(key) ?? { cash: 0, fop: 0, card: 0, deposit: 0 }
    const amt = revenue(s)
    if (amt === 0) { map.set(key, d); continue }
    if (s.payment_method === 'cash')          d.cash    += amt
    else if (s.payment_method === 'fop')      d.fop     += amt
    else if (s.payment_method === 'personal_card') d.card += amt
    else if (s.payment_method === 'deposit')  d.deposit += amt
    map.set(key, d)
  }
  const rows: DayRow[] = Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, d]) => ({ date, ...d, real: d.cash + d.fop + d.card }))
  const totals = rows.reduce(
    (acc, r) => ({ cash: acc.cash + r.cash, fop: acc.fop + r.fop, card: acc.card + r.card, deposit: acc.deposit + r.deposit, real: acc.real + r.real }),
    { cash: 0, fop: 0, card: 0, deposit: 0, real: 0 }
  )
  return { rows, totals }
}

// Сторінкове правило: 0 → «—». Решта — через єдиний formatMoney.
function fmt(n: number): string {
  return n === 0 ? '—' : formatMoney(n)
}

function fmtTotal(n: number): string {
  return formatMoney(n)
}

function getToday(): string {
  return toYMD(new Date())
}

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
  const [dateTo, setDateTo] = useState(getToday)
  const [sales, setSales] = useState<SaleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSales = useCallback(async (from: string, to: string) => {
    setLoading(true)
    setError(null)
    const { data, error } = await listSalesForAccounting(supabase, from, to)
    if (error) { setError(error); setLoading(false); return }
    setSales(data as SaleRow[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchSales(dateFrom, dateTo) }, [dateFrom, dateTo, fetchSales])

  const { rows, totals } = useMemo(() => aggregate(sales), [sales])

  function setPreset(from: string, to: string) {
    setDateFrom(from); setDateTo(to)
  }

  const todayStr     = getToday()
  const weekStr      = getWeekStart()
  const monthStr     = getMonthStart()
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
          <div className={styles.topbarLinks}>
            <a href="/accounting/reconciliation" className={styles.reconcileLink}>
              Звірка →
            </a>
            <a href="/accounting/trainers" className={styles.trainerReportLink}>
              Звіт по тренерах →
            </a>
          </div>
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
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.empty}>Завантаження...</div>
          ) : error ? (
            <div className={styles.empty}>Помилка: {error}</div>
          ) : (
            <>
              <div className={styles.summary}>
                <div className={styles.card}>
                  <div className={styles.cardLabel}>Готівка</div>
                  <div className={`${styles.cardValue} ${styles.valCash}`}>{fmtTotal(totals.cash)}</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardLabel}>ФОП</div>
                  <div className={`${styles.cardValue} ${styles.valFop}`}>{fmtTotal(totals.fop)}</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardLabel}>Картка</div>
                  <div className={`${styles.cardValue} ${styles.valCard}`}>{fmtTotal(totals.card)}</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardLabel}>З депозиту</div>
                  <div className={`${styles.cardValue} ${styles.valDeposit}`}>{fmtTotal(totals.deposit)}</div>
                </div>
                <div className={`${styles.card} ${styles.cardTotal}`}>
                  <div className={styles.cardLabel}>Надходження</div>
                  <div className={styles.cardValue}>{fmtTotal(totals.real)}</div>
                </div>
              </div>

              {rows.length === 0 ? (
                <div className={styles.empty}>{MSG.empty.salesPeriod}</div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Готівка</th>
                        <th>ФОП</th>
                        <th>Картка</th>
                        <th>З депозиту</th>
                        <th>Надходження</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.date}>
                          <td className={styles.dateCell}>{r.date.split('-').reverse().join('.')}</td>
                          <td className={r.cash    > 0 ? styles.valCash    : styles.zero}>{fmt(r.cash)}</td>
                          <td className={r.fop     > 0 ? styles.valFop     : styles.zero}>{fmt(r.fop)}</td>
                          <td className={r.card    > 0 ? styles.valCard    : styles.zero}>{fmt(r.card)}</td>
                          <td className={r.deposit > 0 ? styles.valDeposit : styles.zero}>{fmt(r.deposit)}</td>
                          <td className={styles.rowTotal}>{fmtTotal(r.real)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className={styles.footRow}>
                        <td>Всього</td>
                        <td className={totals.cash    > 0 ? styles.valCash    : styles.zero}>{fmt(totals.cash)}</td>
                        <td className={totals.fop     > 0 ? styles.valFop     : styles.zero}>{fmt(totals.fop)}</td>
                        <td className={totals.card    > 0 ? styles.valCard    : styles.zero}>{fmt(totals.card)}</td>
                        <td className={totals.deposit > 0 ? styles.valDeposit : styles.zero}>{fmt(totals.deposit)}</td>
                        <td className={styles.rowTotal}>{fmtTotal(totals.real)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
