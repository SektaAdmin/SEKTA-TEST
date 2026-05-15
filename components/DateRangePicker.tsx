'use client'
import { useState, useEffect, useRef } from 'react'
import { getMondayOf, isSameDay } from '@/lib/dateUtils'
import CalendarPopover, { calStyles } from './CalendarPopover'
import styles from './DateRangePicker.module.css'

interface DateRangePickerProps {
  startDate: Date
  endDate: Date
  onChange: (date: Date) => void
  label?: string
  mode?: 'week' | 'day'
}

function pad(n: number): string { return String(n).padStart(2, '0') }

function formatLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
  if (isSameDay(start, end)) return fmt(start)
  return `${fmt(start)} – ${fmt(end)}`
}

export default function DateRangePicker({ startDate, endDate, onChange, label, mode = 'week' }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(startDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(startDate.getMonth())
  const wrapRef = useRef<HTMLDivElement>(null)

  const today = new Date(); today.setHours(0, 0, 0, 0)

  useEffect(() => {
    setViewYear(startDate.getFullYear())
    setViewMonth(startDate.getMonth())
  }, [startDate.getFullYear(), startDate.getMonth()])

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const displayLabel = label ?? formatLabel(startDate, endDate)

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        type="button"
      >
        <span>{displayLabel}</span>
      </button>

      <CalendarPopover
        anchorRef={wrapRef as React.RefObject<HTMLElement>}
        open={open}
        onClose={() => setOpen(false)}
        viewYear={viewYear}
        viewMonth={viewMonth}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
        renderDay={(day, inMonth, i) => {
          const inWeek = day >= startDate && day <= endDate
          const isToday = isSameDay(day, today)
          const monday = getMondayOf(day)
          const isMon = isSameDay(day, monday)
          const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
          const isSun = isSameDay(day, sunday)

          return (
            <button
              key={i}
              type="button"
              className={[
                calStyles.day,
                !inMonth ? calStyles.dayOutside : '',
                inWeek ? calStyles.dayInWeek : '',
                inWeek && isMon ? calStyles.dayWeekStart : '',
                inWeek && isSun ? calStyles.dayWeekEnd : '',
              ].filter(Boolean).join(' ')}
              onClick={() => { onChange(mode === 'day' ? day : getMondayOf(day)); setOpen(false) }}
              aria-label={day.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
              aria-pressed={inWeek}
            >
              <span className={calStyles.dayNum}>{day.getDate()}</span>
              {isToday && <span className={calStyles.todayDot} aria-hidden="true" />}
            </button>
          )
        }}
      />
    </div>
  )
}
