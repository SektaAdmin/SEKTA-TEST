'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { listSessionDebtorsForDate, listNegativeBalanceClients } from '@/lib/queries/dashboard'
import { formatMoney } from '@/lib/formatters'
import { StatCard } from '@/components/ui/StatCard'
import { useRealtime } from '@/lib/useRealtime'
import styles from '../dashboard.module.css'

/* Картки-алерти: те, що потребує дії сьогодні.
   1) Скільки людей піде в мінус по сесіях сьогодні.
   2) Скільки клієнтів у мінусі по грошовому депозиту (на весь час). */
export function AlertCardsBlock({ date }: { date: string }) {
  const [debtors, setDebtors] = useState<number | null>(null)
  const [negCount, setNegCount] = useState<number | null>(null)
  const [negSum, setNegSum] = useState(0)

  const load = useCallback(() => {
    let cancelled = false
    Promise.all([
      listSessionDebtorsForDate(supabase, date),
      listNegativeBalanceClients(supabase),
    ]).then(([debtRes, negRes]) => {
      if (cancelled) return
      const count = debtRes.data.reduce((s, g) => s + g.clients.length, 0)
      setDebtors(debtRes.error ? null : count)
      setNegCount(negRes.error ? null : negRes.data.length)
      setNegSum(negRes.data.reduce((s, c) => s + c.balance, 0))
    })
    return () => { cancelled = true }
  }, [date])

  useEffect(() => { return load() }, [load])
  useRealtime(['classes', 'enrollments', 'client_session_balances', 'balance_transactions'], load)

  return (
    <div className={styles.cardGrid}>
      <StatCard
        label="Боржники по сесіях сьогодні"
        value={debtors == null ? '—' : `${debtors}`}
        hint={debtors ? 'Деталі нижче ↓' : 'Нікого 🎉'}
        accent={debtors ? 'danger' : 'default'}
        loading={debtors == null && negCount == null}
      />
      <StatCard
        label="Мінус по депозиту"
        value={negCount == null ? '—' : `${negCount}`}
        hint={negCount ? `${formatMoney(negSum)} разом →` : 'Усі в плюсі'}
        href="/clients"
        accent={negCount ? 'danger' : 'default'}
        loading={debtors == null && negCount == null}
      />
    </div>
  )
}
