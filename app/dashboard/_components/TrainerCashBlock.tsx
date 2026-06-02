'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { listAllCashBalances } from '@/lib/queries/trainer-rates'
import { getCashIncomingByHolderForDate } from '@/lib/queries/dashboard'
import { formatMoney } from '@/lib/formatters'
import { useRealtime } from '@/lib/useRealtime'
import styles from '../dashboard.module.css'

/* Блок: готівка на руках у тренерів + що сьогодні надійшло (cash-продажі).
   Баланс — через listAllCashBalances (≈4 запити на всіх), а не N×6.
   Показуємо лише тренерів із залишком ≠ 0 або надходженнями сьогодні. */
type Row = { id: string; name: string; total: number; todayIncoming: number }

export function TrainerCashBlock({ date }: { date: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)

    async function run() {
      const [balRes, todayRes] = await Promise.all([
        listAllCashBalances(supabase),
        getCashIncomingByHolderForDate(supabase, date),
      ])
      if (cancelled) return

      const err = balRes.error ?? todayRes.error ?? null
      if (err) { setError(err); setLoading(false); return }

      const todayByHolder = todayRes.data

      const result: Row[] = balRes.data.map(b => ({
        id: b.trainer_id,
        name: b.trainer_name,
        total: b.balance,
        todayIncoming: todayByHolder.get(b.trainer_id) ?? 0,
      }))

      setError(null)
      setRows(result)
      setLoading(false)
    }

    run()
    return () => { cancelled = true }
  }, [date])

  useEffect(() => { return load() }, [load])
  useRealtime(['sales', 'studio_expenses', 'trainer_payments'], load)

  return (
    <section className={styles.block}>
      <h2 className={styles.blockTitle}>Готівка на руках у тренерів</h2>

      {loading && <div className="loading-dots"><span /><span /><span /></div>}
      {error && <div className={styles.empty}>Помилка завантаження: {error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div className={styles.empty}>Немає готівки на руках</div>
      )}

      {!loading && !error && rows.map(r => (
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
