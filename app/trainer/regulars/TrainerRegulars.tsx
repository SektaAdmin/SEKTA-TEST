'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRefs } from '@/contexts/RefsContext'
import { DOW_LABELS_FULL } from '@/lib/dateUtils'
import { MSG } from '@/lib/messages'
import type { TrainerRegularsSeriesRow } from '@/lib/queries/trainer-cabinet'
import styles from './regulars.module.css'

// Пн→Нд для навігації; class_series.day_of_week — 0=Нд..6=Сб.
const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0]

function todayDowIndex(): number {
  const dow = new Date().getDay()
  const i = DAYS_ORDER.indexOf(dow)
  return i === -1 ? 0 : i
}

function timeRange(timeOfDay: string, durationMin: number): string {
  const [h, m] = timeOfDay.split(':').map(Number)
  const startMin = h * 60 + m
  const endMin = startMin + durationMin
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}–${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`
}

// Для 2-годинних занять постійник може ходити лише на одну годину —
// показуємо, на яку саме (той самий розрахунок, що в SeriesModal.tsx).
function formatHoursLabel(hours: number[] | null, timeOfDay: string): string | null {
  if (!hours || hours.length === 0) return null
  const sorted = [...hours].sort()
  if (sorted.length >= 2) return null
  const [h, m] = timeOfDay.split(':').map(Number)
  const totalMin = h * 60 + m + (sorted[0] - 1) * 60
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0')
  const mm = String(totalMin % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function clientName(c: { first_name: string | null; last_name: string | null }): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Клієнт'
}

type Props = {
  series: TrainerRegularsSeriesRow[]
}

export default function TrainerRegulars({ series }: Props) {
  const router = useRouter()
  const { trainingTypes } = useRefs()
  const [activeDowIndex, setActiveDowIndex] = useState(todayDowIndex)
  const activeDow = DAYS_ORDER[activeDowIndex]

  function goPrevDay() {
    setActiveDowIndex(i => (i - 1 + DAYS_ORDER.length) % DAYS_ORDER.length)
  }
  function goNextDay() {
    setActiveDowIndex(i => (i + 1) % DAYS_ORDER.length)
  }

  function typeLabel(code: string): string {
    return trainingTypes.find(t => t.code === code)?.label ?? code
  }

  const dayTemplates = series.filter(s => s.day_of_week === activeDow)

  return (
    <div className={styles.shell}>
      <div className={styles.topbar}>
        <button className={styles.backBtn} onClick={() => router.push('/trainer')} aria-label="Меню">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 2L4 7l5 5" />
          </svg>
          <span>Меню</span>
        </button>
        <span className={styles.topbarTitle}>Постійники</span>
        <span className={styles.topbarSpacer} />
      </div>

      <div className={styles.dayNav}>
        <button className={styles.dayNavBtn} onClick={goPrevDay} aria-label="Попередній день">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 2L4 7l5 5" />
          </svg>
        </button>
        <span className={styles.dayNavLabel}>{DOW_LABELS_FULL[activeDow]}</span>
        <button className={styles.dayNavBtn} onClick={goNextDay} aria-label="Наступний день">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 2l5 5-5 5" />
          </svg>
        </button>
      </div>

      <div className={styles.scroll}>
        {series.length === 0 ? (
          <div className={styles.empty}>{MSG.empty.regulars}</div>
        ) : dayTemplates.length === 0 ? (
          <div className={styles.empty}>{MSG.empty.regularsDay}</div>
        ) : (
          <div className={styles.list}>
            {dayTemplates.map(s => (
              <div key={s.id} className={styles.slotCard}>
                <div className={styles.slotHeader}>
                  <span className={styles.slotTime}>{timeRange(s.time_of_day, s.duration_min)}</span>
                  <span className={styles.slotMeta}>
                    {typeLabel(s.ticket_type)}{s.halls?.name ? ` · ${s.halls.name}` : ''}
                  </span>
                </div>
                {s.title && <div className={styles.slotTitle}>{s.title}</div>}

                <div className={styles.clientList}>
                  {(s.series_clients ?? []).length === 0 ? (
                    <span className={styles.noClients}>{MSG.empty.seriesClients}</span>
                  ) : (
                    s.series_clients.map((row, i) => {
                      const hoursLabel = formatHoursLabel(row.hours_attended, s.time_of_day)
                      return (
                        <div key={row.id} className={styles.clientChip}>
                          <span className={styles.clientNum}>{i + 1}</span>
                          <span className={styles.clientChipName}>{clientName(row.clients)}</span>
                          {hoursLabel && <span className={`badge badge-type ${styles.hoursTag}`}>{hoursLabel}</span>}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
