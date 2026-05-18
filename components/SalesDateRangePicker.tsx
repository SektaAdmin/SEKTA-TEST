'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { buildCalendarDays, isSameDay } from '@/lib/dateUtils'
import { calStyles } from './CalendarPopover'
import styles from './SalesDateRangePicker.module.css'

const MONTHS_UK = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень']
const WEEKDAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд']

interface Props {
  dateFrom: string
  dateTo: string
  onChangeFrom: (v: string) => void
  onChangeTo: (v: string) => void
  onClear: () => void
}

function toYMD(d: Date): string {
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-')
}

function parseYMD(ymd: string): Date | null {
  if (!ymd) return null
  const [y,m,d] = ymd.split('-').map(Number)
  return new Date(y, m-1, d)
}

function formatDisplay(ymd: string): string {
  if (!ymd) return ''
  const [y,m,d] = ymd.split('-')
  return `${d}.${m}.${y}`
}

function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0,0,0,0); return r
}

type Preset = { label: string; getRange: () => { from: string; to: string } }

function buildPresets(): Preset[] {
  const now = startOfDay(new Date())
  return [
    {
      label: 'Сьогодні',
      getRange: () => ({ from: toYMD(now), to: toYMD(now) }),
    },
    {
      label: 'Вчора',
      getRange: () => {
        const d = new Date(now); d.setDate(d.getDate()-1)
        return { from: toYMD(d), to: toYMD(d) }
      },
    },
    {
      label: 'Останні 7 днів',
      getRange: () => {
        const d = new Date(now); d.setDate(d.getDate()-6)
        return { from: toYMD(d), to: toYMD(now) }
      },
    },
    {
      label: 'Останні 30 днів',
      getRange: () => {
        const d = new Date(now); d.setDate(d.getDate()-29)
        return { from: toYMD(d), to: toYMD(now) }
      },
    },
    {
      label: 'Цей місяць',
      getRange: () => {
        const start = new Date(now.getFullYear(), now.getMonth(), 1)
        const end = new Date(now.getFullYear(), now.getMonth()+1, 0)
        return { from: toYMD(start), to: toYMD(end) }
      },
    },
    {
      label: 'Минулий місяць',
      getRange: () => {
        const start = new Date(now.getFullYear(), now.getMonth()-1, 1)
        const end = new Date(now.getFullYear(), now.getMonth(), 0)
        return { from: toYMD(start), to: toYMD(end) }
      },
    },
  ]
}

function getActivePreset(dateFrom: string, dateTo: string): string | null {
  for (const p of buildPresets()) {
    const r = p.getRange()
    if (r.from === dateFrom && r.to === dateTo) return p.label
  }
  return null
}

export default function SalesDateRangePicker({ dateFrom, dateTo, onChangeFrom, onChangeTo, onClear }: Props) {
  const [open, setOpen] = useState(false)
  const [pendingStart, setPendingStart] = useState<string | null>(null)
  const [hoverDate, setHoverDate] = useState<string | null>(null)

  const now = startOfDay(new Date())
  const initMonth = parseYMD(dateFrom) ?? now
  const [viewYear, setViewYear] = useState(initMonth.getFullYear())
  const [viewMonth, setViewMonth] = useState(initMonth.getMonth())

  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const presets = buildPresets()
  const activePreset = getActivePreset(dateFrom, dateTo)

  const hasValue = dateFrom !== '' || dateTo !== ''
  const triggerLabel = hasValue
    ? [formatDisplay(dateFrom), formatDisplay(dateTo)].filter(Boolean).join(' – ')
    : 'Будь-який період'

  useEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX })
  }, [open])

  useEffect(() => {
    if (!open) { setPendingStart(null); setHoverDate(null); return }
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        popoverRef.current && !popoverRef.current.contains(t)
      ) { setOpen(false) }
    }
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function handleDayClick(ymd: string) {
    if (!pendingStart) {
      setPendingStart(ymd)
    } else {
      let from = pendingStart
      let to = ymd
      if (to < from) { [from, to] = [to, from] }
      onChangeFrom(from)
      onChangeTo(to)
      setPendingStart(null)
      setHoverDate(null)
      setOpen(false)
    }
  }

  function handlePreset(preset: Preset) {
    const r = preset.getRange()
    onChangeFrom(r.from)
    onChangeTo(r.to)
    setPendingStart(null)
    setHoverDate(null)
    setOpen(false)
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y-1); setViewMonth(11) }
    else setViewMonth(m => m-1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y+1); setViewMonth(0) }
    else setViewMonth(m => m+1)
  }

  const days = buildCalendarDays(viewYear, viewMonth)
  const today = now

  // Effective range for highlight (supports hover preview)
  const effectiveFrom = pendingStart ?? dateFrom
  const effectiveTo = pendingStart
    ? (hoverDate
        ? (hoverDate >= pendingStart ? hoverDate : pendingStart)
        : null)
    : dateTo
  const effectiveFromFinal = pendingStart && hoverDate && hoverDate < pendingStart ? hoverDate : effectiveFrom
  const effectiveToFinal = pendingStart && hoverDate && hoverDate < pendingStart ? pendingStart : effectiveTo

  return (
    <div className={styles.wrap} ref={triggerRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''} ${!hasValue ? styles.triggerEmpty : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg className={styles.calIcon} width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="12" height="11" rx="2"/>
          <path d="M5 1v3M11 1v3M2 7h12"/>
        </svg>
        <span>{triggerLabel}</span>
        <svg className={styles.chevron} width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 3.5l3 3 3-3"/>
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className={styles.popover}
          style={{ position: 'absolute', top: pos.top, left: pos.left }}
          role="dialog"
          aria-modal="true"
          aria-label="Вибір діапазону дат"
        >
          {/* Ліва колонка — пресети */}
          <div className={styles.presets}>
            <div className={styles.presetsTitle}>Швидкий вибір</div>
            {presets.map(p => (
              <button
                key={p.label}
                type="button"
                className={`${styles.presetBtn} ${activePreset === p.label ? styles.presetBtnActive : ''}`}
                onClick={() => handlePreset(p)}
              >
                {p.label}
              </button>
            ))}
            {hasValue && (
              <button
                type="button"
                className={styles.clearBtn}
                onClick={() => { onClear(); setOpen(false) }}
              >
                Скинути
              </button>
            )}
          </div>

          {/* Права колонка — календар */}
          <div className={styles.calWrap}>
            <div className={styles.calHeader}>
              <button type="button" className={styles.monthNav} onClick={prevMonth} aria-label="Попередній місяць">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 2L4 6l4 4"/>
                </svg>
              </button>
              <span className={styles.monthLabel}>{MONTHS_UK[viewMonth]} {viewYear}</span>
              <button type="button" className={styles.monthNav} onClick={nextMonth} aria-label="Наступний місяць">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 2l4 4-4 4"/>
                </svg>
              </button>
            </div>

            <div className={styles.grid}>
              {WEEKDAYS.map(d => (
                <div key={d} className={calStyles.weekday}>{d}</div>
              ))}
              {days.map((day, i) => {
                const ymd = toYMD(day)
                const inMonth = day.getMonth() === viewMonth
                const isToday = isSameDay(day, today)
                const isStart = effectiveFromFinal ? ymd === effectiveFromFinal : false
                const isEnd = effectiveToFinal ? ymd === effectiveToFinal : false
                const inRange = effectiveFromFinal && effectiveToFinal
                  ? ymd > effectiveFromFinal && ymd < effectiveToFinal
                  : false
                const isEndpoint = isStart || isEnd

                return (
                  <button
                    key={i}
                    type="button"
                    className={[
                      calStyles.day,
                      !inMonth ? calStyles.dayOutside : '',
                      (inRange || isEndpoint) ? calStyles.dayInWeek : '',
                      isStart ? calStyles.dayWeekStart : '',
                      isEnd ? calStyles.dayWeekEnd : '',
                      isEndpoint ? calStyles.daySelected : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => handleDayClick(ymd)}
                    onMouseEnter={() => pendingStart && setHoverDate(ymd)}
                    onMouseLeave={() => pendingStart && setHoverDate(null)}
                    aria-label={day.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
                    aria-pressed={isEndpoint}
                  >
                    <span className={calStyles.dayNum}>{day.getDate()}</span>
                    {isToday && <span className={calStyles.todayDot} aria-hidden="true" />}
                  </button>
                )
              })}
            </div>

            {pendingStart && (
              <div className={styles.hint}>Оберіть кінцеву дату</div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
