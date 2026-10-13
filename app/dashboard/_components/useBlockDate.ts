'use client'
import { useState } from 'react'

/** Локальна дата блоку дашборду. null = «слідувати сьогодні»: опівнічний rollover
 * з page.tsx працює, поки користувач не обрав іншу дату. */
export function useBlockDate(today: string) {
  const [picked, setPicked] = useState<string | null>(null)
  const date = picked ?? today
  const setDate = (v: string) => setPicked(!v || v === today ? null : v)
  return { date, setDate, isToday: date === today }
}
