'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { buildCalendarDays } from '@/lib/dateUtils'
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

function isTodayYMD(ymd: string): boolean {
  return ymd === toYMD(startOfDay(new Date()))
}

type Preset = { label: string; getRange: () => { from: string; to: string } | null }

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
      label: 'Цей тиждень',
      getRange: () => {
        const d = new Date(now)
        const day = d.getDay() === 0 ? 6 : d.getDay()-1
        const start = new Date(d); start.setDate(d.getDate()-day)
        return { from: toYMD(start), to: toYMD(now) }
      },
    },
    {
      label: 'Минулий тиждень',
      getRange: () => {
        const d = new Date(now)
        const day = d.getDay() === 0 ? 6 : d.getDay()-1
        const thisMonday = new Date(d); thisMonday.setDate(d.getDate()-day)
        const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate()-7)
        const lastSunday = new Date(thisMonday); lastSunday.setDate(thisMonday.getDate()-1)
        return { from: toYMD(lastMonday), to: toYMD(lastSunday) }
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
    {
      label: 'Цей рік',
      getRange: () => {
        const start = new Date(now.getFullYear(), 0, 1)
        const end = new Date(now.getFullYear(), 11, 31)
        return { from: toYMD(start), to: toYMD(end) }
      },
    },
    {
      label: 'Минулий рік',
      getRange: () => {
        const start = new Date(now.getFullYear()-1, 0, 1)
        const end = new Date(now.getFullYear()-1, 11, 31)
        return { from: toYMD(start), to: toYMD(end) }
      },
    },
    {
      label: 'Весь час',
      getRange: () => null,
    },
  ]
}

function getActivePreset(dateFrom: string, dateTo: string): string | null {
  if (!dateFrom && !dateTo) return 'Весь час'
  for (const p of buildPresets()) {
    const r = p.getRange()
    if (!r) continue
    if (r.from === dateFrom && r.to === dateTo) return p.label
  }
  return null
}

function renderMonthGrid(
  year: number,
  month: number,
  effectiveFrom: string,
  effectiveTo: string,
  pendingFrom: string | null,
  onDayClick: (ymd: string) => void,
  onDayHover: (ymd: string) => void,
  onDayLeave: () => void,
) {
  const days = buildCalendarDays(year, month)
  const todayYMD = toYMD(startOfDay(new Date()))

  return days.map((day, i) => {
    const ymd = toYMD(day)
    const inMonth = day.getMonth() === month
    const isToday = ymd === todayYMD

    const from = effectiveFrom
    const to = effectiveTo

    const isStart = from ? ymd === from : false
    const isEnd = to ? ymd === to : false
    const inRange = from && to ? ymd > from && ymd < to : false
    const isEndpoint = isStart || isEnd
    const isSingleDay = from && to && from === to && isStart

    return (
      <button
        key={`${year}-${month}-${i}`}
        type="button"
        className={[
          styles.day,
          !inMonth ? styles.dayOutside : '',
          inRange ? styles.dayInRange : '',
          isStart && !isSingleDay ? styles.dayRangeStart : '',
          isEnd && !isSingleDay ? styles.dayRangeEnd : '',
          isEndpoint ? styles.dayEndpoint : '',
        ].filter(Boolean).join(' ')}
        onClick={() => onDayClick(ymd)}
        onMouseEnter={() => pendingFrom && onDayHover(ymd)}
        onMouseLeave={() => pendingFrom && onDayLeave()}
        aria-label={day.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
        aria-pressed={isEndpoint}
      >
        <span className={styles.dayNum}>{day.getDate()}</span>
        {isToday && <span className={styles.todayDot} aria-hidden="true" />}
      </button>
    )
  })
}

export default function SalesDateRangePicker({ dateFrom, dateTo, onChangeFrom, onChangeTo, onClear }: Props) {
  const [open, setOpen] = useState(false)

  // Draft state — застосовується лише через Apply
  const [pendingFrom, setPendingFrom] = useState<string>(dateFrom)
  const [pendingTo, setPendingTo] = useState<string>(dateTo)
  // Буфер для ручного введення дат у футері
  const [inputFrom, setInputFrom] = useState<string>(dateFrom ? formatDisplay(dateFrom) : '')
  const [inputTo, setInputTo] = useState<string>(dateTo ? formatDisplay(dateTo) : '')
  // Першый клік вибору (ще не другий)
  const [selectingFrom, setSelectingFrom] = useState<string | null>(null)
  const [hoverDate, setHoverDate] = useState<string | null>(null)

  const now = startOfDay(new Date())
  const initLeft = parseYMD(dateFrom) ?? now
  const [leftYear, setLeftYear] = useState(initLeft.getFullYear())
  const [leftMonth, setLeftMonth] = useState(initLeft.getMonth())

  // Правий місяць = лівий + 1
  const rightMonth = leftMonth === 11 ? 0 : leftMonth + 1
  const rightYear = leftMonth === 11 ? leftYear + 1 : leftYear

  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const presets = buildPresets()
  const activePreset = getActivePreset(dateFrom, dateTo)

  const hasValue = dateFrom !== '' || dateTo !== ''
  const triggerLabel = hasValue
    ? [formatDisplay(dateFrom), formatDisplay(dateTo)].filter(Boolean).join(' – ')
    : 'Будь-який період'

  function handleDateInput(raw: string, field: 'from' | 'to') {
    if (field === 'from') setInputFrom(raw)
    else setInputTo(raw)

    if (raw === '') {
      if (field === 'from') setPendingFrom('')
      else setPendingTo('')
      return
    }
    if (raw.length === 10) {
      const parts = raw.split('.')
      if (parts.length === 3) {
        const [d, m, y] = parts.map(Number)
        const date = new Date(y, m-1, d)
        if (!isNaN(date.getTime()) && date.getDate() === d && date.getMonth() === m-1) {
          const ymd = toYMD(date)
          if (field === 'from') { setPendingFrom(ymd); setSelectingFrom(null) }
          else setPendingTo(ymd)
        }
      }
    }
  }

  // Синхронізувати pending при відкритті
  function handleOpen() {
    setPendingFrom(dateFrom)
    setPendingTo(dateTo)
    setInputFrom(dateFrom ? formatDisplay(dateFrom) : '')
    setInputTo(dateTo ? formatDisplay(dateTo) : '')
    setSelectingFrom(null)
    setHoverDate(null)
    const d = parseYMD(dateFrom) ?? now
    setLeftYear(d.getFullYear())
    setLeftMonth(d.getMonth())
    setOpen(true)
  }

  useEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    // Перевірити чи попап вліз справа, інакше вирівняти по правому краю тригера
    setPos({ top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        popoverRef.current && !popoverRef.current.contains(t)
      ) {
        setPendingFrom(dateFrom)
        setPendingTo(dateTo)
        setSelectingFrom(null)
        setOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPendingFrom(dateFrom)
        setPendingTo(dateTo)
        setSelectingFrom(null)
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, dateFrom, dateTo])

  function handleDayClick(ymd: string) {
    if (!selectingFrom) {
      setSelectingFrom(ymd)
      setPendingFrom(ymd)
      setPendingTo('')
      setInputFrom(formatDisplay(ymd))
      setInputTo('')
    } else {
      let from = selectingFrom
      let to = ymd
      if (to < from) { [from, to] = [to, from] }
      setPendingFrom(from)
      setPendingTo(to)
      setInputFrom(formatDisplay(from))
      setInputTo(formatDisplay(to))
      setSelectingFrom(null)
      setHoverDate(null)
    }
  }

  function handlePreset(preset: Preset) {
    const r = preset.getRange()
    if (!r) {
      onClear()
      setInputFrom('')
      setInputTo('')
    } else {
      onChangeFrom(r.from)
      onChangeTo(r.to)
      setInputFrom(formatDisplay(r.from))
      setInputTo(formatDisplay(r.to))
    }
    setSelectingFrom(null)
    setHoverDate(null)
    setOpen(false)
  }

  function handleApply() {
    onChangeFrom(pendingFrom)
    onChangeTo(pendingTo)
    setSelectingFrom(null)
    setOpen(false)
  }

  function handleCancel() {
    setPendingFrom(dateFrom)
    setPendingTo(dateTo)
    setSelectingFrom(null)
    setHoverDate(null)
    setOpen(false)
  }

  function prevMonth() {
    if (leftMonth === 0) { setLeftYear(y => y-1); setLeftMonth(11) }
    else setLeftMonth(m => m-1)
  }
  function nextMonth() {
    if (leftMonth === 11) { setLeftYear(y => y+1); setLeftMonth(0) }
    else setLeftMonth(m => m+1)
  }

  // Ефективний діапазон для рендеру (з hover-preview)
  let effectiveFrom = pendingFrom
  let effectiveTo = pendingTo

  if (selectingFrom && hoverDate) {
    if (hoverDate >= selectingFrom) {
      effectiveFrom = selectingFrom
      effectiveTo = hoverDate
    } else {
      effectiveFrom = hoverDate
      effectiveTo = selectingFrom
    }
  } else if (selectingFrom && !hoverDate) {
    effectiveFrom = selectingFrom
    effectiveTo = ''
  }

  return (
    <div className={styles.wrap} ref={triggerRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''} ${!hasValue ? styles.triggerEmpty : ''}`}
        onClick={handleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg className={styles.calIcon} width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="12" height="11" rx="2"/>
          <path d="M5 1v3M11 1v3M2 7h12"/>
        </svg>
        <span>{triggerLabel}</span>
        <svg className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
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
          </div>

          {/* Права частина — два календарі + футер */}
          <div className={styles.right}>
            <div className={styles.calendars}>
              {/* Лівий місяць */}
              <div className={styles.calWrap}>
                <div className={styles.calHeader}>
                  <button type="button" className={styles.monthNav} onClick={prevMonth} aria-label="Попередній місяць">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2L4 6l4 4"/></svg>
                  </button>
                  <span className={styles.monthLabel}>{MONTHS_UK[leftMonth]} {leftYear}</span>
                  <div className={styles.monthNavPlaceholder} />
                </div>
                <div className={styles.grid}>
                  {WEEKDAYS.map(d => <div key={d} className={styles.weekday}>{d}</div>)}
                  {renderMonthGrid(leftYear, leftMonth, effectiveFrom, effectiveTo, selectingFrom, handleDayClick, setHoverDate, () => setHoverDate(null))}
                </div>
              </div>

              <div className={styles.calDivider} />

              {/* Правий місяць */}
              <div className={styles.calWrap}>
                <div className={styles.calHeader}>
                  <div className={styles.monthNavPlaceholder} />
                  <span className={styles.monthLabel}>{MONTHS_UK[rightMonth]} {rightYear}</span>
                  <button type="button" className={styles.monthNav} onClick={nextMonth} aria-label="Наступний місяць">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 2l4 4-4 4"/></svg>
                  </button>
                </div>
                <div className={styles.grid}>
                  {WEEKDAYS.map(d => <div key={d} className={styles.weekday}>{d}</div>)}
                  {renderMonthGrid(rightYear, rightMonth, effectiveFrom, effectiveTo, selectingFrom, handleDayClick, setHoverDate, () => setHoverDate(null))}
                </div>
              </div>
            </div>

            {/* Футер */}
            <div className={styles.footer}>
              <div className={styles.footerDates}>
                <input
                  className={styles.dateField}
                  type="text"
                  value={inputFrom}
                  placeholder="дд.мм.рррр"
                  onChange={e => handleDateInput(e.target.value, 'from')}
                  maxLength={10}
                  aria-label="Дата початку"
                />
                <span className={styles.dateSep}>—</span>
                <input
                  className={styles.dateField}
                  type="text"
                  value={inputTo}
                  placeholder="дд.мм.рррр"
                  onChange={e => handleDateInput(e.target.value, 'to')}
                  maxLength={10}
                  aria-label="Дата кінця"
                />
              </div>
              <div className={styles.footerBtns}>
                <button type="button" className={styles.btnCancel} onClick={handleCancel}>Скасувати</button>
                <button
                  type="button"
                  className={styles.btnApply}
                  onClick={handleApply}
                  disabled={!pendingFrom && !pendingTo}
                >
                  Застосувати
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
