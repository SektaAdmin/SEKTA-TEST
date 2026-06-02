'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getFopTotalForDate } from '@/lib/queries/dashboard'
import { formatMoney } from '@/lib/formatters'
import { StatCard } from '@/components/ui/StatCard'
import { useRealtime } from '@/lib/useRealtime'

/* Блок 1: ФОП за сьогодні — для ранкової звірки з банк-випискою.
   Клік → /accounting (там сама звірка). */
export function FopTodayCard({ date }: { date: string }) {
  const [total, setTotal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    getFopTotalForDate(supabase, date).then(({ data, error }) => {
      if (cancelled) return
      setError(error)
      setTotal(data)
    })
    return () => { cancelled = true }
  }, [date])

  useEffect(() => { return load() }, [load])
  useRealtime(['sales'], load)

  return (
    <StatCard
      label="ФОП за сьогодні"
      value={error ? '—' : total == null ? '…' : formatMoney(total)}
      hint="Звірити з банк-випискою →"
      href="/accounting"
    />
  )
}
