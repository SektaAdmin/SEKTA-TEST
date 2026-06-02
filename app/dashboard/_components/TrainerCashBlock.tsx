'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  getTrainerCashBalance,
  getTrainerCashBalanceTotal,
} from '@/lib/queries/trainer-rates'
import { useRefs } from '@/contexts/RefsContext'
import { formatMoney } from '@/lib/formatters'
import { useRealtime } from '@/lib/useRealtime'
import styles from '../dashboard.module.css'

/* Блок 4: готівка на руках у тренерів + що сьогодні доначислиться.
   Показуємо лише тренерів із залишком ≠ 0 або надходженнями сьогодні. */
type Row = { id: string; name: string; total: number; todayIncoming: number }

export function TrainerCashBlock({ date }: { date: string }) {
  const { trainers } = useRefs()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    const active = trainers.filter(t => t.is_active)

    Promise.all(
      active.map(async t => {
        const [totalRes, todayRes] = await Promise.all([
          getTrainerCashBalanceTotal(supabase, t.id),
          getTrainerCashBalance(supabase, t.id, date, date),
        ])
        const todayIncoming = todayRes.data.cash_sales.reduce((s, r) => s + r.amount, 0)
        return { id: t.id, name: t.name, total: totalRes.data, todayIncoming }
      })
    ).then(result => {
      if (cancelled) return
      setRows(result.filter(r => r.total !== 0 || r.todayIncoming > 0))
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [trainers, date])

  useEffect(() => { return load() }, [load])
  useRealtime(['sales', 'studio_expenses', 'trainer_payments'], load)

  return (
    <section className={styles.cashBlock}>
      <h2 className={styles.blockTitle}>Готівка на руках у тренерів</h2>

      {loading && <div className="loading-dots"><span /><span /><span /></div>}
      {!loading && rows.length === 0 && (
        <div className={styles.empty}>Немає готівки на руках</div>
      )}

      {!loading && rows.map(r => (
        <div key={r.id} className={styles.cashRow}>
          <span className={styles.cashName}>{r.name}</span>
          <span className={styles.cashTotal}>{formatMoney(r.total)}</span>
          {r.todayIncoming > 0 && (
            <span className={styles.cashToday}>+{formatMoney(r.todayIncoming)} сьогодні</span>
          )}
        </div>
      ))}
    </section>
  )
}
