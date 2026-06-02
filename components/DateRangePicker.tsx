'use client'
import { useState, useRef } from 'react'
import { isSameDay, toYMD } from '@/lib/dateUtils'
import { useMonthView } from '@/hooks/useMonthView'
import CalendarPopover, { calStyles } from './CalendarPopover'
import styles from './DateRangePicker.module.css'

interface DateRangePickerProps {
  startDate: Date
  endDate: Date
  onChange: (date: Date) => void
  label?: string
  activeDates?: Set<string>
  onMonthChange?: (year: number, month: number) => void
}

function pad(n: number): string { return String(n).padStart(2, '0') }

function formatLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
  if (isSameDay(start, end)) return fmt(start)
  return `${fmt(start)} – ${fmt(end)}`
}

export default function DateRangePicker({ startDate, endDate, onChange, label, activeDates, onMonthChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const { viewYear, viewMonth, prevMonth, nextMonth } = useMonthView(startDate, onMonthChange)
  const wrapRef = useRef<HTMLDivElement>(null)

  const today = new Date(); today.setHours(0, 0, 0, 0)

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
          const dateKey = toYMD(day)
          const hasClasses = activeDates?.has(dateKey) ?? false

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
              {hasClasses && !isToday && <span className={calStyles.classDot} aria-hidden="true" />}
            </button>
          )
        }}
      />
    </div>
  )
}
