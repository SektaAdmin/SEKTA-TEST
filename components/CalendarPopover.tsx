'use client'
import { useState, useEffect, useRef, ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { buildCalendarDays, WEEKDAYS_SHORT } from '@/lib/dateUtils'
import styles from './CalendarPopover.module.css'

const MONTHS_UK = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень']

export { styles as calStyles }

interface CalendarPopoverProps {
  anchorRef: RefObject<HTMLElement>
  open: boolean
  onClose: () => void
  viewYear: number
  viewMonth: number
  onPrevMonth: () => void
  onNextMonth: () => void
  renderDay: (day: Date, inMonth: boolean, index: number) => ReactNode
  footer?: ReactNode
}

export default function CalendarPopover({
  anchorRef, open, onClose,
  viewYear, viewMonth, onPrevMonth, onNextMonth,
  renderDay, footer,
}: CalendarPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open || !anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const POPOVER_WIDTH = 256
    const margin = 8
    const rawLeft = rect.left + window.scrollX
    const maxLeft = window.innerWidth - POPOVER_WIDTH - margin
    setPopoverPos({
      top: rect.bottom + window.scrollY + 6,
      left: Math.min(rawLeft, maxLeft),
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node
      if (
        anchorRef.current && !anchorRef.current.contains(t) &&
        popoverRef.current && !popoverRef.current.contains(t)
      ) onClose()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!open || !popoverPos) return null

  const days = buildCalendarDays(viewYear, viewMonth)

  return createPortal(
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{ position: 'absolute', top: popoverPos.top, left: popoverPos.left }}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.calBody}>
        <div className={styles.calHeader}>
          <button type="button" className={styles.monthNav} onClick={onPrevMonth} aria-label="Попередній місяць">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 2L4 6l4 4"/>
            </svg>
          </button>
          <span className={styles.monthLabel}>{MONTHS_UK[viewMonth]} {viewYear}</span>
          <button type="button" className={styles.monthNav} onClick={onNextMonth} aria-label="Наступний місяць">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 2l4 4-4 4"/>
            </svg>
          </button>
        </div>

        <div className={styles.grid}>
          {WEEKDAYS_SHORT.map(d => (
            <div key={d} className={styles.weekday}>{d}</div>
          ))}
          {days.map((day, i) => renderDay(day, day.getMonth() === viewMonth, i))}
        </div>
      </div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>,
    document.body
  )
}
