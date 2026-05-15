'use client'
import { useState, useEffect, useRef } from 'react'
import { isSameDay } from '@/lib/dateUtils'
import CalendarPopover, { calStyles } from './CalendarPopover'
import styles from './DatePicker.module.css'

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function parseYMD(ymd: string): Date | null {
  if (!ymd) return null
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toYMD(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function formatDisplay(ymd: string): string {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-')
  return `${d}.${m}.${y}`
}

export default function DatePicker({ value, onChange, placeholder = 'Оберіть дату' }: DatePickerProps) {
  const selected = parseYMD(value)
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const initDate = selected ?? today
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(initDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(initDate.getMonth())
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected) {
      setViewYear(selected.getFullYear())
      setViewMonth(selected.getMonth())
    }
  }, [value])

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const label = value ? formatDisplay(value) : placeholder
  const hasValue = Boolean(value)

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''} ${!hasValue ? styles.triggerEmpty : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {label}
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
          const isSelected = selected ? isSameDay(day, selected) : false
          const isToday = isSameDay(day, today)
          return (
            <button
              key={i}
              type="button"
              className={[
                calStyles.day,
                !inMonth ? calStyles.dayOutside : '',
                isSelected ? calStyles.daySelected : '',
              ].filter(Boolean).join(' ')}
              onClick={() => { onChange(toYMD(day)); setOpen(false) }}
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
