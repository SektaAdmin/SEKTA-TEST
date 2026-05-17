'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { listSalesForReconciliation, type ReconciliationSale } from '@/lib/queries/sales'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import DatePicker from '@/components/DatePicker'
import styles from './reconciliation.module.css'

type MethodFilter = 'both' | 'fop' | 'card'

function getToday(): string {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-')
}

function getMonthStart(): string {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), '01'].join('-')
}

function getWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-')
}

function revenue(s: ReconciliationSale): number {
  return s.ticket_id !== null ? s.price_paid : Math.max(0, s.amount_given)
}

function fmtDate(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const date = [String(d.getDate()).padStart(2,'0'), String(d.getMonth()+1).padStart(2,'0')].join('.')
  const time = [String(d.getHours()).padStart(2,'0'), String(d.getMinutes()).padStart(2,'0')].join(':')
  return { date, time }
}

function clientName(s: ReconciliationSale): string {
  if (!s.clients) return '—'
  const { first_name, last_name } = s.clients
  return [first_name, last_name].filter(Boolean).join(' ') || '—'
}

export default function ReconciliationPage() {
  const [dateFrom, setDateFrom] = useState(getMonthStart)
  const [dateTo, setDateTo] = useState(getToday)
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('both')
  const [sales, setSales] = useState<ReconciliationSale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [factInput, setFactInput] = useState('')

  const methods = useMemo((): ('fop' | 'personal_card')[] => {
    if (methodFilter === 'fop') return ['fop']
    if (methodFilter === 'card') return ['personal_card']
    return ['fop', 'personal_card']
  }, [methodFilter])

  const fetchSales = useCallback(async (from: string, to: string, m: ('fop' | 'personal_card')[]) => {
    setLoading(true)
    setError(null)
    const { data, error } = await listSalesForReconciliation(supabase, from, to, m)
    if (error) { setError(error); setLoading(false); return }
    setSales(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchSales(dateFrom, dateTo, methods) }, [dateFrom, dateTo, methods, fetchSales])

  const crmTotal = useMemo(() => sales.reduce((sum, s) => sum + revenue(s), 0), [sales])

  const fact = parseFloat(factInput.replace(',', '.'))
  const factValid = factInput.trim() !== '' && !isNaN(fact) && fact >= 0
  const diff = factValid ? crmTotal - fact : null

  const todayStr = getToday()
  const weekStr  = getWeekStart()
  const monthStr = getMonthStart()
  const activePreset =
    dateFrom === todayStr && dateTo === todayStr ? 'today' :
    dateFrom === weekStr  && dateTo === todayStr ? 'week'  :
    dateFrom === monthStr && dateTo === todayStr ? 'month' : null

  function setPreset(from: string, to: string) {
    setDateFrom(from); setDateTo(to)
  }

  function fmtMoney(n: number): string {
    return `${n.toLocaleString('uk-UA')} ₴`
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <BottomNav />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.title}>Звірка надходжень</h1>
          <a href="/accounting" className={styles.backLink}>← Звітність</a>
        </div>

        <div className={styles.filters}>
          <div className={styles.methodTabs}>
            <button
              className={`${styles.methodTab} ${methodFilter === 'both' ? styles.methodTabActive : ''}`}
              onClick={() => setMethodFilter('both')}
            >ФОП + Картка</button>
            <button
              className={`${styles.methodTab} ${methodFilter === 'fop' ? styles.methodTabFop : ''}`}
              onClick={() => setMethodFilter('fop')}
            >ФОП</button>
            <button
              className={`${styles.methodTab} ${methodFilter === 'card' ? styles.methodTabCard : ''}`}
              onClick={() => setMethodFilter('card')}
            >Картка</button>
          </div>

          <div className={styles.presets}>
            <button className={`${styles.preset} ${activePreset === 'today' ? styles.presetActive : ''}`}
              onClick={() => setPreset(todayStr, todayStr)}>Сьогодні</button>
            <button className={`${styles.preset} ${activePreset === 'week' ? styles.presetActive : ''}`}
              onClick={() => setPreset(weekStr, todayStr)}>Тиждень</button>
            <button className={`${styles.preset} ${activePreset === 'month' ? styles.presetActive : ''}`}
              onClick={() => setPreset(monthStr, todayStr)}>Місяць</button>
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
              <div className={styles.reconcileBlock}>
                <div className={styles.reconcileRow}>
                  <span className={styles.reconcileLabel}>CRM за період</span>
                  <span className={styles.reconcileValue}>{fmtMoney(crmTotal)}</span>
                </div>
                <div className={styles.reconcileRow}>
                  <span className={styles.reconcileLabel}>Факт (виписка)</span>
                  <div className={styles.reconcileInputWrap}>
                    <input
                      className={styles.reconcileInput}
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={factInput}
                      onChange={e => setFactInput(e.target.value)}
                    />
                    <span className={styles.reconcileInputSuffix}>₴</span>
                  </div>
                </div>
                <div className={styles.reconcileRow}>
                  <span className={styles.reconcileLabel}>Розбіжність</span>
                  {diff === null ? (
                    <span className={styles.reconcileNeutral}>—</span>
                  ) : diff === 0 ? (
                    <span className={styles.reconcileMatch}>Збігається ✓</span>
                  ) : (
                    <span className={styles.reconcileMismatch}>
                      {diff > 0 ? `+${fmtMoney(diff)}` : `−${fmtMoney(Math.abs(diff))}`}
                    </span>
                  )}
                </div>
              </div>

              {sales.length === 0 ? (
                <div className={styles.empty}>За цей період операцій немає</div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Час</th>
                        <th>Клієнт</th>
                        <th>Абонемент</th>
                        <th>Метод</th>
                        <th className={styles.thRight}>Сума</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map(s => {
                        const { date, time } = fmtDate(s.created_at)
                        const amt = revenue(s)
                        return (
                          <tr key={s.id}>
                            <td className={styles.dateCell}>{date}</td>
                            <td className={styles.timeCell}>{time}</td>
                            <td>{clientName(s)}</td>
                            <td className={styles.ticketCell}>{s.ticket_name ?? '—'}</td>
                            <td>
                              <span className={s.payment_method === 'fop' ? styles.badgeFop : styles.badgeCard}>
                                {s.payment_method === 'fop' ? 'ФОП' : 'Картка'}
                              </span>
                            </td>
                            <td className={styles.amtCell}>{amt > 0 ? fmtMoney(amt) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className={styles.footRow}>
                        <td colSpan={5}>Всього</td>
                        <td className={styles.amtCell}>{fmtMoney(crmTotal)}</td>
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
