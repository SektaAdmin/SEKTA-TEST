'use client'
import styles from './MonthNav.module.css'

const MONTHS_UK = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень']

interface MonthNavProps {
  month: number
  year: number
  onPrev: () => void
  onNext: () => void
}

export default function MonthNav({ month, year, onPrev, onNext }: MonthNavProps) {
  return (
    <div className={styles.monthNav}>
      <button className={styles.navBtn} onClick={onPrev} aria-label="Попередній місяць">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 2L4 7l5 5"/>
        </svg>
      </button>
      <span className={styles.monthLabel}>{MONTHS_UK[month]} {year}</span>
      <button className={styles.navBtn} onClick={onNext} aria-label="Наступний місяць">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M5 2l5 5-5 5"/>
        </svg>
      </button>
    </div>
  )
}
