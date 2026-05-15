'use client'
import { useState, useEffect, useRef } from 'react'
import { isSameDay } from '@/lib/dateUtils'
import CalendarPopover, { calStyles } from './CalendarPopover'
import styles from './DateRangePicker.module.css'

interface DateRangePickerProps {
  startDate: Date
  endDate: Date
  onChange: (date: Date) => void
  label?: string
}

function pad(n: number): string { return String(n).padStart(2, '0') }

function formatLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
  if (isSameDay(start, end)) return fmt(start)
  return `${fmt(start)} – ${fmt(end)}`
}

export default function DateRangePicker({ startDate, endDate, onChange, label }: DateRangePickerProps) {
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
          const isSelected = isSameDay(day, startDate)
          const isToday = isSameDay(day, today)

          return (
            <button
              key={i}
              type="button"
              className={[
                calStyles.day,
                !inMonth ? calStyles.dayOutside : '',
                isSelected ? calStyles.dayInWeek : '',
                isSelected ? calStyles.dayWeekStart : '',
                isSelected ? calStyles.dayWeekEnd : '',
              ].filter(Boolean).join(' ')}
              onClick={() => { onChange(day); setOpen(false) }}
              aria-label={day.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
              aria-pressed={isSelected}
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
