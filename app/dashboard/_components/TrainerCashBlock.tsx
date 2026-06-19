'use client'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { listAllCashBalances } from '@/lib/queries/trainer-rates'
import { getCashIncomingByHolderForDate } from '@/lib/queries/dashboard'
import { formatMoney } from '@/lib/formatters'
import { useListQuery } from '@/hooks/useListQuery'
import { BlockError } from './BlockError'
import styles from '../dashboard.module.css'

/* Блок: готівка на руках у тренерів + що сьогодні надійшло (cash-продажі).
   Баланс — через listAllCashBalances (≈4 запити на всіх), а не N×6.
   Показуємо лише тренерів із залишком ≠ 0 або надходженнями сьогодні. */
type Row = { id: string; name: string; total: number; todayIncoming: number }

export function TrainerCashBlock({ date }: { date: string }) {
  const { data: rows, loading, error, refetch } = useListQuery<Row>(
    async () => {
      const [balRes, todayRes] = await Promise.all([
        listAllCashBalances(supabase),
        getCashIncomingByHolderForDate(supabase, date),
      ])
      const err = balRes.error ?? todayRes.error ?? null
      if (err) return { data: [], error: err }

      const todayByHolder = todayRes.data
      const result: Row[] = balRes.data.map(b => ({
        id: b.trainer_id,
        name: b.trainer_name,
        total: b.balance,
        todayIncoming: todayByHolder.get(b.trainer_id) ?? 0,
      }))
      return { data: result, error: null }
    },
    [date],
    { realtime: ['sales', 'studio_expenses', 'trainer_payments'] }
  )

  useEffect(() => {
    if (error) console.error('[TrainerCashBlock]', error)
  }, [error])

  return (
    <section className={`${styles.block} ${styles.equalBlockSm}`}>
      <h2 className={`${styles.blockTitle} ${styles.blockHeadFixed}`}>Готівка на руках у тренерів</h2>

      <div className={styles.scrollBody}>
      {loading && <div className="loading-dots" role="status" aria-label="Завантаження..."><span /><span /><span /></div>}
      {error && <BlockError onRetry={refetch} />}
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
      </div>
    </section>
  )
}
