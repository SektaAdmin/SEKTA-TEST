'use client'
import { useState, useEffect, useRef } from 'react'
import { isSameDay } from '@/lib/dateUtils'
import { useMonthView } from '@/hooks/useMonthView'
import { datetimeLocalToDisplay, parseDisplayToDatetimeLocal } from '@/lib/formatters'
import CalendarPopover, { calStyles } from './CalendarPopover'
import styles from './DateTimePicker.module.css'

interface DateTimePickerProps {
  value: string         // datetime-local format: "YYYY-MM-DDTHH:mm"
  onChange: (value: string) => void
  disabled?: boolean
}

function parseDatetimeLocal(value: string): { date: Date | null; hours: number; minutes: number } {
  if (!value) return { date: null, hours: 0, minutes: 0 }
  const [datePart, timePart = '00:00'] = value.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const [h, min] = timePart.split(':').map(Number)
  return { date: new Date(y, m - 1, d), hours: h || 0, minutes: min || 0 }
}

function toDatetimeLocal(date: Date, hours: number, minutes: number): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(hours).padStart(2, '0')
  const min = String(minutes).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}`
}

export default function DateTimePicker({ value, onChange, disabled }: DateTimePickerProps) {
  const [display, setDisplay] = useState(() => datetimeLocalToDisplay(value))
  const [open, setOpen] = useState(false)
  const { date: initDate, hours: initH, minutes: initMin } = parseDatetimeLocal(value)
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const { viewYear, viewMonth, prevMonth, nextMonth } = useMonthView(initDate)
  const [hours, setHours] = useState(initH)
  const [minutes, setMinutes] = useState(initMin)

  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const parsed = parseDatetimeLocal(value)
    setDisplay(datetimeLocalToDisplay(value))
    setHours(parsed.hours)
    setMinutes(parsed.minutes)
  }, [value])

  function handleDayClick(day: Date) {
    const newVal = toDatetimeLocal(day, hours, minutes)
    onChange(newVal)
    setDisplay(datetimeLocalToDisplay(newVal))
  }

  function handleHoursChange(raw: string) {
    const h = Math.max(0, Math.min(23, parseInt(raw) || 0))
    setHours(h)
    const { date } = parseDatetimeLocal(value)
    if (date) {
      const newVal = toDatetimeLocal(date, h, minutes)
      onChange(newVal)
      setDisplay(datetimeLocalToDisplay(newVal))
    }
  }

  function handleMinutesChange(raw: string) {
    const min = Math.max(0, Math.min(59, parseInt(raw) || 0))
    setMinutes(min)
    const { date } = parseDatetimeLocal(value)
    if (date) {
      const newVal = toDatetimeLocal(date, hours, min)
      onChange(newVal)
      setDisplay(datetimeLocalToDisplay(newVal))
    }
  }

  function handleDisplayChange(text: string) {
    setDisplay(text)
    const parsed = parseDisplayToDatetimeLocal(text)
    if (parsed) onChange(parsed)
  }

  const { date: selectedDate } = parseDatetimeLocal(value)

  const timeFooter = (
    <div className={styles.timeRow}>
      <span className={styles.timeLabel}>Час</span>
      <input
        type="number"
        className={styles.timeInput}
        value={String(hours).padStart(2, '0')}
        min={0}
        max={23}
        onChange={e => handleHoursChange(e.target.value)}
        onClick={e => e.stopPropagation()}
      />
      <span className={styles.timeSep}>:</span>
      <input
        type="number"
        className={styles.timeInput}
        value={String(minutes).padStart(2, '0')}
        min={0}
        max={59}
        onChange={e => handleMinutesChange(e.target.value)}
        onClick={e => e.stopPropagation()}
      />
    </div>
  )

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.row}>
        <input
          type="text"
          className={styles.textInput}
          value={display}
          onChange={e => handleDisplayChange(e.target.value)}
          placeholder="ДД.ММ.РРРР ГГ:ХХ"
          disabled={disabled}
        />
        <button
          type="button"
          className={styles.calendarBtn}
          onClick={() => setOpen(o => !o)}
          disabled={disabled}
          aria-label="Відкрити календар"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="3" width="14" height="12" rx="1.5"/>
            <line x1="5" y1="1" x2="5" y2="5"/><line x1="11" y1="1" x2="11" y2="5"/>
            <line x1="1" y1="7" x2="15" y2="7"/>
          </svg>
        </button>
      </div>

      <CalendarPopover
        anchorRef={wrapRef as React.RefObject<HTMLElement>}
        open={open}
        onClose={() => setOpen(false)}
        viewYear={viewYear}
        viewMonth={viewMonth}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
        footer={timeFooter}
        renderDay={(day, inMonth, i) => {
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
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
              onClick={() => handleDayClick(day)}
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
