'use client'
import { supabase } from '@/lib/supabase'
import { getMoneyTotalsForDate } from '@/lib/queries/dashboard'
import { formatMoney } from '@/lib/formatters'
import { StatCard } from '@/components/ui/StatCard'
import { useAsync } from '@/hooks/useAsync'

/* Гроші за сьогодні по методах оплати — для ранкової звірки з банк-випискою.
   ФОП/Картка → /accounting (там сама звірка). */
export function MoneyCardsBlock({ date }: { date: string }) {
  const { data: t, loading } = useAsync(
    () => getMoneyTotalsForDate(supabase, date),
    [date],
    { realtime: ['sales', 'studio_expenses'] }
  )

  const v = (n: number | undefined) => (n == null ? '—' : n === 0 ? '—' : formatMoney(n))

  return (
    <>
      <StatCard label="Готівка сьогодні" value={v(t?.cash)} loading={loading} />
      <StatCard label="ФОП сьогодні" value={v(t?.fop)} hint="Звірити →" href="/accounting" loading={loading} />
      <StatCard label="Картка сьогодні" value={v(t?.personal_card)} loading={loading} />
      <StatCard label="Депозит сьогодні" value={v(t?.deposit)} loading={loading} />
      {!loading && (t?.expense ?? 0) > 0 && (
        <StatCard label="Витрати сьогодні" value={formatMoney(t!.expense)} accent="danger" />
      )}
    </>
  )
}
