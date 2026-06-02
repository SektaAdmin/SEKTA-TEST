'use client'
import { supabase } from '@/lib/supabase'
import { listSessionDebtorsForDate, listNegativeBalanceClients } from '@/lib/queries/dashboard'
import { formatMoney } from '@/lib/formatters'
import { StatCard } from '@/components/ui/StatCard'
import { useAsync } from '@/hooks/useAsync'

/* Картки-алерти: те, що потребує дії сьогодні.
   1) Скільки людей піде в мінус по сесіях сьогодні.
   2) Скільки клієнтів у мінусі по грошовому депозиту (на весь час). */
export function AlertCardsBlock({ date }: { date: string }) {
  const { data, loading } = useAsync(
    async () => {
      const [debtRes, negRes] = await Promise.all([
        listSessionDebtorsForDate(supabase, date),
        listNegativeBalanceClients(supabase),
      ])
      const error = debtRes.error ?? negRes.error ?? null
      return {
        data: {
          debtors: debtRes.error ? null : debtRes.data.reduce((s, g) => s + g.clients.length, 0),
          negCount: negRes.error ? null : negRes.data.length,
          negSum: negRes.data.reduce((s, c) => s + c.balance, 0),
        },
        error,
      }
    },
    [date],
    { realtime: ['classes', 'enrollments', 'client_session_balances', 'balance_transactions'] }
  )

  const debtors = data?.debtors ?? null
  const negCount = data?.negCount ?? null
  const negSum = data?.negSum ?? 0

  return (
    <>
      <StatCard
        label="Боржники по сесіях сьогодні"
        value={debtors == null ? '—' : `${debtors}`}
        hint={debtors ? 'Деталі нижче ↓' : 'Нікого 🎉'}
        accent={debtors ? 'danger' : 'default'}
        loading={loading}
      />
      <StatCard
        label="Мінус по депозиту"
        value={negCount == null ? '—' : `${negCount}`}
        hint={negCount ? `${formatMoney(negSum)} разом →` : 'Усі в плюсі'}
        href="/clients"
        accent={negCount ? 'danger' : 'default'}
        loading={loading}
      />
    </>
  )
}
