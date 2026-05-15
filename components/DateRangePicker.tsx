'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './DateRangePicker.module.css'

interface DateRangePickerProps {
  startDate: Date
  endDate: Date
  onChange: (date: Date) => void
  label?: string
  mode?: 'week' | 'day'
}

const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December']
const WEEKDAYS = ['Mo','Tu','We','Th','Fr','Sa','Su']

function getMondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function formatLabel(start: Date, end: Date): string {
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
  const year = end.getFullYear()
  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${year}`
  }
  return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${year}`
}

function buildCalendarDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const firstDow = first.getDay() // 0=Sun
  // adjust so Mon=0
  const startOffset = firstDow === 0 ? 6 : firstDow - 1
  const days: Date[] = []
  const start = new Date(year, month, 1 - startOffset)
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }
  return days
}

export default function DateRangePicker({ startDate, endDate, onChange, label, mode = 'week' }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(startDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(startDate.getMonth())
  const wrapRef = useRef<HTMLDivElement>(null)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const days = buildCalendarDays(viewYear, viewMonth)

  // sync viewMonth when startDate changes externally
  useEffect(() => {
    setViewYear(startDate.getFullYear())
    setViewMonth(startDate.getMonth())
  }, [startDate.getFullYear(), startDate.getMonth()])

  // close on outside click or Escape
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  function selectDay(day: Date) {
    onChange(mode === 'day' ? day : getMondayOf(day))
    setOpen(false)
  }

  function isDayInSelectedWeek(day: Date): boolean {
    return day >= startDate && day <= endDate
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
        <svg
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          width="12" height="12" viewBox="0 0 12 12"
          fill="none" stroke="currentColor" strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M2 4l4 4 4-4"/>
        </svg>
      </button>

      {open && (
        <div
          className={styles.popover}
          role="dialog"
          aria-label="Виберіть тиждень"
          aria-modal="true"
        >
          <div className={styles.calHeader}>
            <button
              className={styles.monthNav}
              onClick={prevMonth}
              aria-label="Попередній місяць"
              type="button"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 2L4 6l4 4"/>
              </svg>
            </button>
            <span className={styles.monthLabel}>{MONTHS_EN[viewMonth]} {viewYear}</span>
            <button
              className={styles.monthNav}
              onClick={nextMonth}
              aria-label="Наступний місяць"
              type="button"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 2l4 4-4 4"/>
              </svg>
            </button>
          </div>

          <div className={styles.grid}>
            {WEEKDAYS.map(d => (
              <div key={d} className={styles.weekday}>{d}</div>
            ))}
            {days.map((day, i) => {
              const inMonth = day.getMonth() === viewMonth
              const inWeek = isDayInSelectedWeek(day)
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
                    styles.day,
                    !inMonth ? styles.dayOutside : '',
                    inWeek ? styles.dayInWeek : '',
                    inWeek && isMon ? styles.dayWeekStart : '',
                    inWeek && isSun ? styles.dayWeekEnd : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => selectDay(day)}
                  aria-label={day.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
                  aria-pressed={inWeek}
                >
                  <span className={styles.dayNum}>{day.getDate()}</span>
                  {isToday && <span className={styles.todayDot} aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
