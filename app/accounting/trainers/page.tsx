'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { listSalesForTrainers } from '@/lib/queries/sales'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import MonthNav from '@/components/MonthNav'
import styles from './trainers.module.css'


type SaleRow = {
  trainer_id: string
  sessions: number | null
  price_paid: number
  payment_method: string
  ticket_type: string | null
  trainers: { name: string } | null
}

type TrainerSummary = {
  trainer_id: string
  name: string
  salesCount: number
  totalSessions: number
  totalRevenue: number
  byType: Record<string, { sessions: number; revenue: number }>
}

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}


const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Готівка',
  fop: 'ФОП',
  personal_card: 'Картка',
  deposit: 'Депозит',
}

export default function TrainerReportsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [paymentFilter, setPaymentFilter] = useState<string>('all')
  const [sales, setSales] = useState<SaleRow[]>([])
  const [loading, setLoading] = useState(true)

  const { start, end } = useMemo(() => getMonthRange(year, month), [year, month])

  const fetchSales = useCallback(async () => {
    setLoading(true)
    const data = await listSalesForTrainers(supabase, start, end)
    setSales(data as SaleRow[])
    setLoading(false)
  }, [start, end])

  useEffect(() => { fetchSales() }, [fetchSales])

  const summaries = useMemo<TrainerSummary[]>(() => {
    const filtered = paymentFilter === 'all'
      ? sales
      : sales.filter(s => s.payment_method === paymentFilter)

    const map = new Map<string, TrainerSummary>()
    for (const s of filtered) {
      if (!s.trainer_id) continue
      const existing = map.get(s.trainer_id) ?? {
        trainer_id: s.trainer_id,
        name: s.trainers?.name ?? '—',
        salesCount: 0,
        totalSessions: 0,
        totalRevenue: 0,
        byType: {},
      }
      existing.salesCount++
      existing.totalSessions += s.sessions ?? 0
      existing.totalRevenue += s.price_paid
      const type = s.ticket_type ?? 'інше'
      const byType = existing.byType[type] ?? { sessions: 0, revenue: 0 }
      byType.sessions += s.sessions ?? 0
      byType.revenue += s.price_paid
      existing.byType[type] = byType
      map.set(s.trainer_id, existing)
    }
    return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)
  }, [sales, paymentFilter])

  const totals = useMemo(() => summaries.reduce(
    (acc, s) => ({
      salesCount: acc.salesCount + s.salesCount,
      totalSessions: acc.totalSessions + s.totalSessions,
      totalRevenue: acc.totalRevenue + s.totalRevenue,
    }),
    { salesCount: 0, totalSessions: 0, totalRevenue: 0 }
  ), [summaries])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <BottomNav />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.title}>Звіти по тренерах</h1>
          <a href="/accounting" className={styles.backLink}>← Звітність</a>
        </div>

        <div className={styles.filterBar}>
          <MonthNav month={month} year={year} onPrev={prevMonth} onNext={nextMonth} />
          <div className={styles.paymentFilter}>
            {['all', 'cash', 'fop', 'personal_card', 'deposit'].map(v => (
              <button
                key={v}
                className={`${styles.filterBtn} ${paymentFilter === v ? styles.filterBtnActive : ''}`}
                onClick={() => setPaymentFilter(v)}
              >
                {v === 'all' ? 'Всі методи' : PAYMENT_LABELS[v]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.empty}>Завантаження...</div>
          ) : summaries.length === 0 ? (
            <div className={styles.empty}>Немає продажів з тренером за цей період</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Тренер</th>
                    <th>Продажі</th>
                    <th>Годин</th>
                    <th>Дохід</th>
                    <th>По типах занять</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map(s => (
                    <tr key={s.trainer_id}>
                      <td className={styles.trainerName}>{s.name}</td>
                      <td className={styles.num}>{s.salesCount}</td>
                      <td className={styles.num}>{s.totalSessions}</td>
                      <td className={styles.revenue}>{s.totalRevenue.toLocaleString('uk-UA')} ₴</td>
                      <td>
                        <div className={styles.byType}>
                          {Object.entries(s.byType).map(([type, data]) => (
                            <span key={type} className={styles.typeChip}>
                              {type}: {data.sessions}г · {data.revenue.toLocaleString('uk-UA')} ₴
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={styles.totalRow}>
                    <td>Всього</td>
                    <td className={styles.num}>{totals.salesCount}</td>
                    <td className={styles.num}>{totals.totalSessions}</td>
                    <td className={styles.revenue}>{totals.totalRevenue.toLocaleString('uk-UA')} ₴</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
