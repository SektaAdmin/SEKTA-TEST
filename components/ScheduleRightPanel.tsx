'use client'
import { buildCalendarDays, isSameDay, MONTHS_UK_FULL } from '@/lib/dateUtils'
import ScheduleDetailCard from '@/components/ScheduleDetailCard'
import styles from './ScheduleRightPanel.module.css'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']

interface Props {
  viewYear: number
  viewMonth: number
  onPrevMonth: () => void
  onNextMonth: () => void
  activeDates: Set<string>
  selectedDate: Date
  onDateSelect: (d: Date) => void
  detailClassId: string | null
  onDetailClose: () => void
  onOpenFullDetail: () => void
  onClassUpdated: () => void
}

export default function ScheduleRightPanel({
  viewYear,
  viewMonth,
  onPrevMonth,
  onNextMonth,
  activeDates,
  selectedDate,
  onDateSelect,
  detailClassId,
  onDetailClose,
  onOpenFullDetail,
  onClassUpdated,
}: Props) {
  const days = buildCalendarDays(viewYear, viewMonth)

  function formatYMD(d: Date): string {
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join(
      '-'
    )
  }

  function renderDay(day: Date, inMonth: boolean) {
    const isToday = isSameDay(day, new Date())
    const isSelected = isSameDay(day, selectedDate)
    const hasClasses = activeDates.has(formatYMD(day))
    const dayClasses = [styles.day]

    if (!inMonth) dayClasses.push(styles.dayOutside)
    if (isSelected) dayClasses.push(styles.daySelected)

    return (
      <button
        key={day.toISOString()}
        type="button"
        className={dayClasses.join(' ')}
        onClick={() => onDateSelect(day)}
      >
        <span className={styles.dayNum}>{day.getDate()}</span>
        {isToday && <span className={styles.todayDot} />}
        {hasClasses && !isToday && <span className={styles.classDot} />}
      </button>
    )
  }

  return (
    <aside className={styles.rightPanel}>
      <div className={styles.miniCal}>
        <div className={styles.miniCalHeader}>
          <button type="button" className={styles.monthNav} onClick={onPrevMonth} aria-label="Попередній місяць">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 2L4 6l4 4" />
            </svg>
          </button>
          <span className={styles.monthLabel}>
            {MONTHS_UK_FULL[viewMonth]} {viewYear}
          </span>
          <button type="button" className={styles.monthNav} onClick={onNextMonth} aria-label="Наступний місяць">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 2l4 4-4 4" />
            </svg>
          </button>
        </div>

        <div className={styles.miniCalGrid}>
          {WEEKDAYS.map(d => (
            <div key={d} className={styles.weekday}>
              {d}
            </div>
          ))}
          {days.map(day => renderDay(day, day.getMonth() === viewMonth))}
        </div>
      </div>

      {detailClassId && (
        <ScheduleDetailCard classId={detailClassId} onClose={onDetailClose} onOpenFull={onOpenFullDetail} />
      )}
    </aside>
  )
}
