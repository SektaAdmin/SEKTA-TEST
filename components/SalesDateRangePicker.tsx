'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { buildCalendarDays, WEEKDAYS_SHORT, toYMD, parseYMD, ymdToDisplay, MONTHS_UK_CAP } from '@/lib/dateUtils'
import { calStyles } from './CalendarPopover'
import styles from './SalesDateRangePicker.module.css'

interface Props {
  dateFrom: string
  dateTo: string
  onChangeFrom: (v: string) => void
  onChangeTo: (v: string) => void
  onClear: () => void
}

// Маска: raw = '18052026' (8 цифр ДДММРРРР) → display = '18.05.2026'
function digitsToDisplay(raw: string): string {
  const d = raw.padEnd(8, '_').split('')
  return `${d[0]}${d[1]}.${d[2]}${d[3]}.${d[4]}${d[5]}${d[6]}${d[7]}`
}

// YYYY-MM-DD → '18052026'
function ymdToRaw(ymd: string): string {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-')
  return `${d}${m}${y}`
}

// '18052026' → курсор-позиція у відображуваному рядку
function rawLenToCursorPos(len: number): number {
  if (len <= 2) return len
  if (len <= 4) return len + 1  // після першої точки
  return len + 2                // після другої точки
}

// Парсить raw (8 цифр ДДММРРРР) → YMD або null
function rawToYMD(raw: string): string | null {
  if (raw.length !== 8) return null
  const d = Number(raw.slice(0, 2))
  const m = Number(raw.slice(2, 4))
  const y = Number(raw.slice(4, 8))
  const date = new Date(y, m - 1, d)
  if (!isNaN(date.getTime()) && date.getDate() === d && date.getMonth() === m - 1 && y > 1900) {
    return toYMD(date)
  }
  return null
}

function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0,0,0,0); return r
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
          calStyles.day,
          styles.day,
          !inMonth ? calStyles.dayOutside : '',
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
        <span className={`${calStyles.dayNum} ${styles.dayNum}`}>{day.getDate()}</span>
        {isToday && <span className={calStyles.todayDot} aria-hidden="true" />}
      </button>
    )
  })
}

export default function SalesDateRangePicker({ dateFrom, dateTo, onChangeFrom, onChangeTo, onClear }: Props) {
  const [open, setOpen] = useState(false)

  // Draft state — застосовується лише через Apply
  const [pendingFrom, setPendingFrom] = useState<string>(dateFrom)
  const [pendingTo, setPendingTo] = useState<string>(dateTo)
  // Маска: raw = лише цифри ДДММРРРР (max 8)
  const [rawFrom, setRawFrom] = useState<string>(ymdToRaw(dateFrom))
  const [rawTo, setRawTo] = useState<string>(ymdToRaw(dateTo))
  // Refs для позиціонування курсору
  const inputFromRef = useRef<HTMLInputElement>(null)
  const inputToRef = useRef<HTMLInputElement>(null)
  // Перший клік вибору (ще не другий)
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
  const [isMobile, setIsMobile] = useState(false)

  const presets = buildPresets()
  const activePreset = getActivePreset(dateFrom, dateTo)

  const hasValue = dateFrom !== '' || dateTo !== ''
  const triggerLabel = hasValue
    ? [ymdToDisplay(dateFrom), ymdToDisplay(dateTo)].filter(Boolean).join(' – ')
    : 'Будь-який період'

  function handleRawChange(newRaw: string, field: 'from' | 'to') {
    if (field === 'from') {
      setRawFrom(newRaw)
      const ymd = rawToYMD(newRaw)
      if (ymd) { setPendingFrom(ymd); setSelectingFrom(null) }
      else setPendingFrom('')
    } else {
      setRawTo(newRaw)
      const ymd = rawToYMD(newRaw)
      if (ymd) setPendingTo(ymd)
      else setPendingTo('')
    }
  }

  function makeMaskKeyDown(field: 'from' | 'to') {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      const raw = field === 'from' ? rawFrom : rawTo
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        if (raw.length < 8) handleRawChange(raw + e.key, field)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        handleRawChange(raw.slice(0, -1), field)
      } else if (e.key === '.' || e.key === '/' || e.key === '-') {
        e.preventDefault()
      } else if (e.key === 'Tab' || e.key === 'Enter' || e.key === 'Escape') {
        // дозволяємо нативну поведінку
      } else if (!e.metaKey && !e.ctrlKey) {
        e.preventDefault()
      }
    }
  }

  function makeMaskPaste(field: 'from' | 'to') {
    return (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault()
      const text = e.clipboardData.getData('text')
      let digits = text.replace(/\D/g, '')
      // 2-цифровий рік: якщо 6 цифр → розширити рік до 4 (ДДММРР → ДДММ20РР)
      if (digits.length === 6) {
        digits = digits.slice(0, 4) + '20' + digits.slice(4)
      }
      handleRawChange(digits.slice(0, 8), field)
    }
  }

  // Позиціонування курсору після зміни raw
  useEffect(() => {
    if (!inputFromRef.current) return
    const pos = rawLenToCursorPos(rawFrom.length)
    requestAnimationFrame(() => inputFromRef.current?.setSelectionRange(pos, pos))
  }, [rawFrom])

  useEffect(() => {
    if (!inputToRef.current) return
    const pos = rawLenToCursorPos(rawTo.length)
    requestAnimationFrame(() => inputToRef.current?.setSelectionRange(pos, pos))
  }, [rawTo])

  // Синхронізувати pending при відкритті
  function handleOpen() {
    setIsMobile(typeof window !== 'undefined' && window.innerWidth <= 640)
    setPendingFrom(dateFrom)
    setPendingTo(dateTo)
    setRawFrom(ymdToRaw(dateFrom))
    setRawTo(ymdToRaw(dateTo))
    setSelectingFrom(null)
    setHoverDate(null)
    const d = parseYMD(dateFrom) ?? now
    setLeftYear(d.getFullYear())
    setLeftMonth(d.getMonth())
    setOpen(true)
  }

  useEffect(() => {
    if (!open || isMobile || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    // Перевірити чи попап вліз справа, інакше вирівняти по правому краю тригера
    setPos({ top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX })
  }, [open, isMobile])

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
      setRawFrom(ymdToRaw(ymd))
      setRawTo('')
    } else {
      let from = selectingFrom
      let to = ymd
      if (to < from) { [from, to] = [to, from] }
      setPendingFrom(from)
      setPendingTo(to)
      setRawFrom(ymdToRaw(from))
      setRawTo(ymdToRaw(to))
      setSelectingFrom(null)
      setHoverDate(null)
    }
  }

  function handlePreset(preset: Preset) {
    const r = preset.getRange()
    if (!r) {
      onClear()
      setRawFrom('')
      setRawTo('')
    } else {
      onChangeFrom(r.from)
      onChangeTo(r.to)
      setRawFrom(ymdToRaw(r.from))
      setRawTo(ymdToRaw(r.to))
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

      {open && (isMobile || pos) && createPortal(
        <div
          ref={popoverRef}
          className={styles.popover}
          style={isMobile
            ? { position: 'fixed', bottom: 0, left: 0, right: 0 }
            : { position: 'absolute', top: pos!.top, left: pos!.left }
          }
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
                <div className={calStyles.calHeader}>
                  <button type="button" className={calStyles.monthNav} onClick={prevMonth} aria-label="Попередній місяць">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2L4 6l4 4"/></svg>
                  </button>
                  <span className={calStyles.monthLabel}>{MONTHS_UK_CAP[leftMonth]} {leftYear}</span>
                  <div className={styles.monthNavPlaceholder} />
                </div>
                <div className={calStyles.grid}>
                  {WEEKDAYS_SHORT.map(d => <div key={d} className={calStyles.weekday}>{d}</div>)}
                  {renderMonthGrid(leftYear, leftMonth, effectiveFrom, effectiveTo, selectingFrom, handleDayClick, setHoverDate, () => setHoverDate(null))}
                </div>
              </div>

              <div className={styles.calDivider} />

              {/* Правий місяць */}
              <div className={styles.calWrap}>
                <div className={calStyles.calHeader}>
                  <div className={styles.monthNavPlaceholder} />
                  <span className={calStyles.monthLabel}>{MONTHS_UK_CAP[rightMonth]} {rightYear}</span>
                  <button type="button" className={calStyles.monthNav} onClick={nextMonth} aria-label="Наступний місяць">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 2l4 4-4 4"/></svg>
                  </button>
                </div>
                <div className={calStyles.grid}>
                  {WEEKDAYS_SHORT.map(d => <div key={d} className={calStyles.weekday}>{d}</div>)}
                  {renderMonthGrid(rightYear, rightMonth, effectiveFrom, effectiveTo, selectingFrom, handleDayClick, setHoverDate, () => setHoverDate(null))}
                </div>
              </div>
            </div>

            {/* Футер */}
            <div className={styles.footer}>
              <div className={styles.footerDates}>
                <input
                  ref={inputFromRef}
                  className={styles.dateField}
                  type="text"
                  value={digitsToDisplay(rawFrom)}
                  onChange={() => {}}
                  onKeyDown={makeMaskKeyDown('from')}
                  onPaste={makeMaskPaste('from')}
                  onClick={e => {
                    const pos = rawLenToCursorPos(rawFrom.length)
                    ;(e.target as HTMLInputElement).setSelectionRange(pos, pos)
                  }}
                  aria-label="Дата початку"
                />
                <span className={styles.dateSep}>—</span>
                <input
                  ref={inputToRef}
                  className={styles.dateField}
                  type="text"
                  value={digitsToDisplay(rawTo)}
                  onChange={() => {}}
                  onKeyDown={makeMaskKeyDown('to')}
                  onPaste={makeMaskPaste('to')}
                  onClick={e => {
                    const pos = rawLenToCursorPos(rawTo.length)
                    ;(e.target as HTMLInputElement).setSelectionRange(pos, pos)
                  }}
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
