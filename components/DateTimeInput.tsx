'use client'
import { useState, useRef } from 'react'
import { datetimeLocalToDisplay, parseDisplayToDatetimeLocal } from '@/lib/formatters'
import styles from './DateTimeInput.module.css'

interface DateTimeInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export default function DateTimeInput({ value, onChange, disabled }: DateTimeInputProps) {
  const [display, setDisplay] = useState(() => datetimeLocalToDisplay(value))
  const pickerRef = useRef<HTMLInputElement>(null)

  function handleDisplayChange(text: string) {
    setDisplay(text)
    const parsed = parseDisplayToDatetimeLocal(text)
    if (parsed) onChange(parsed)
  }

  function handlePickerChange(dt: string) {
    onChange(dt)
    setDisplay(datetimeLocalToDisplay(dt))
  }

  return (
    <div className={styles.datetimeRow}>
      <input
        type="text"
        value={display}
        onChange={e => handleDisplayChange(e.target.value)}
        placeholder="ДД.ММ.РРРР ГГ:ХХ"
        disabled={disabled}
      />
      <button
        type="button"
        className={styles.calendarBtn}
        onClick={() => {
          try { pickerRef.current?.showPicker() }
          catch { pickerRef.current?.focus() }
        }}
        disabled={disabled}
        aria-label="Відкрити календар"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="3" width="14" height="12" rx="1.5"/>
          <line x1="5" y1="1" x2="5" y2="5"/><line x1="11" y1="1" x2="11" y2="5"/>
          <line x1="1" y1="7" x2="15" y2="7"/>
        </svg>
      </button>
      <input
        ref={pickerRef}
        type="datetime-local"
        value={value}
        onChange={e => handlePickerChange(e.target.value)}
        disabled={disabled}
        className={styles.datetimeHidden}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  )
}
