'use client'
import { useState, useEffect } from 'react'

/**
 * Стан «який місяць показано в календарі» + навігація вперед/назад.
 * Спільна логіка DatePicker / DateRangePicker / DateTimePicker —
 * раніше дублювалась у кожному (viewYear/viewMonth + prev/next + sync-useEffect).
 *
 * @param anchor  дата, на яку синхронізувати вигляд (selected/startDate). null → залишити поточний місяць
 * @param onChange опційний колбек при перемиканні місяця (DateRangePicker.onMonthChange для довантаження activeDates)
 */
export function useMonthView(
  anchor: Date | null,
  onChange?: (year: number, month: number) => void,
) {
  const init = anchor ?? (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t })()
  const [viewYear, setViewYear] = useState(init.getFullYear())
  const [viewMonth, setViewMonth] = useState(init.getMonth())

  const anchorYear = anchor?.getFullYear()
  const anchorMonth = anchor?.getMonth()
  useEffect(() => {
    if (anchorYear == null || anchorMonth == null) return
    setViewYear(anchorYear)
    setViewMonth(anchorMonth)
  }, [anchorYear, anchorMonth])

  function prevMonth() {
    const y = viewMonth === 0 ? viewYear - 1 : viewYear
    const m = viewMonth === 0 ? 11 : viewMonth - 1
    setViewYear(y); setViewMonth(m)
    onChange?.(y, m)
  }
  function nextMonth() {
    const y = viewMonth === 11 ? viewYear + 1 : viewYear
    const m = viewMonth === 11 ? 0 : viewMonth + 1
    setViewYear(y); setViewMonth(m)
    onChange?.(y, m)
  }

  return { viewYear, viewMonth, prevMonth, nextMonth }
}
