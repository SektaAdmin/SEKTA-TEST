'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getMoneyTotalsForDate, type MoneyTotals } from '@/lib/queries/dashboard'
import { formatMoney } from '@/lib/formatters'
import { StatCard } from '@/components/ui/StatCard'
import { useRealtime } from '@/lib/useRealtime'
import styles from '../dashboard.module.css'

/* Гроші за сьогодні по методах оплати — для ранкової звірки з банк-випискою.
   ФОП/Картка → /accounting (там сама звірка). */
export function MoneyCardsBlock({ date }: { date: string }) {
  const [t, setT] = useState<MoneyTotals | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    getMoneyTotalsForDate(supabase, date).then(({ data, error }) => {
      if (cancelled) return
      setError(error)
      setT(error ? null : data)
    })
    return () => { cancelled = true }
  }, [date])

  useEffect(() => { return load() }, [load])
  useRealtime(['sales', 'studio_expenses'], load)

  const loading = t == null && !error
  const v = (n: number | undefined) => (n == null ? '—' : n === 0 ? '—' : formatMoney(n))

  return (
    <div className={styles.cardGrid}>
      <StatCard label="Готівка сьогодні" value={v(t?.cash)} loading={loading} />
      <StatCard label="ФОП сьогодні" value={v(t?.fop)} hint="Звірити →" href="/accounting" loading={loading} />
      <StatCard label="Картка сьогодні" value={v(t?.personal_card)} loading={loading} />
      <StatCard label="Депозит сьогодні" value={v(t?.deposit)} loading={loading} />
      {!loading && (t?.expense ?? 0) > 0 && (
        <StatCard label="Витрати сьогодні" value={formatMoney(t!.expense)} accent="danger" />
      )}
    </div>
  )
}
