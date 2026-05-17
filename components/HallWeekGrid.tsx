'use client'
import { useMemo } from 'react'
import { typeColor } from '@/lib/typeColor'
import type { ClassSeries, Hall, TrainingType } from '@/types'
import { getOverCapacityCount, isClientCountFull, isClientCountAlmost } from '@/lib/scheduleMetrics'
import styles from './HallWeekGrid.module.css'

const DAYS: { label: string; dow: number }[] = [
  { label: 'Понеділок', dow: 1 },
  { label: 'Вівторок', dow: 2 },
  { label: 'Середа', dow: 3 },
  { label: 'Четвер', dow: 4 },
  { label: 'Пʼятниця', dow: 5 },
  { label: 'Субота', dow: 6 },
  { label: 'Неділя', dow: 0 },
]

const MIN_HOUR = 7
const MAX_HOUR = 23
const HOUR_HEIGHT = 64
const CARD_MIN_HEIGHT = 48
const HOURS = Array.from({ length: MAX_HOUR - MIN_HOUR }, (_, i) => MIN_HOUR + i)
const TOTAL_H = HOUR_HEIGHT * (MAX_HOUR - MIN_HOUR)

const DAY_NAME_W = 72
const TIME_GUTTER_W = 44

function cardTop(timeOfDay: string): number {
  const [h, m] = timeOfDay.split(':').map(Number)
  return (h - MIN_HOUR + m / 60) * HOUR_HEIGHT
}

function cardHeight(durationMin: number): number {
  return Math.max((durationMin / 60) * HOUR_HEIGHT, CARD_MIN_HEIGHT)
}

interface Props {
  series: ClassSeries[]
  halls: Hall[]
  trainingTypes: TrainingType[]
  onCardClick: (s: ClassSeries) => void
  onSlotClick?: (dow: number, time: string, hallId: string | null) => void
}

export default function HallWeekGrid({ series, halls, trainingTypes, onCardClick, onSlotClick }: Props) {
  const activeHalls = useMemo(() => halls.filter(h => h.is_active), [halls])

  const typeLabel = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of trainingTypes) m.set(t.code, t.label)
    return m
  }, [trainingTypes])

  const hallCols = useMemo(() => {
    const hallIds = new Set(series.map(s => s.hall_id ?? null))
    const result: (Hall | null)[] = activeHalls.filter(h => hallIds.has(h.id))
    if (hallIds.has(null)) result.push(null)
    return result
  }, [series, activeHalls])

  const byDowHall = useMemo(() => {
    const map = new Map<number, Map<string | null, ClassSeries[]>>()
    for (const { dow } of DAYS) map.set(dow, new Map())
    for (const s of series) {
      const dowMap = map.get(s.day_of_week)!
      const key = s.hall_id ?? null
      if (!dowMap.has(key)) dowMap.set(key, [])
      dowMap.get(key)!.push(s)
    }
    return map
  }, [series])

  // grid-template-columns: day-name | time-gutter | hall cols
  const colTemplate = `${DAY_NAME_W}px ${TIME_GUTTER_W}px repeat(${hallCols.length}, minmax(140px, 1fr))`

  return (
    <div className={styles.root}>
      {/* ── Sticky header: day-name corner | time corner | hall labels ── */}
      <div className={styles.stickyHeader} style={{ gridTemplateColumns: colTemplate }}>
        <div className={styles.cornerDay} />
        <div className={styles.cornerTime} />
        {hallCols.map(hall => (
          <div key={hall?.id ?? '__nohall'} className={styles.hallHeaderCell}>
            {hall ? hall.name : 'Без залу'}
          </div>
        ))}
      </div>

      {/* ── Scrollable body ── */}
      <div className={styles.scrollBody}>
        {DAYS.map(({ label, dow }) => {
          const dowMap = byDowHall.get(dow)!
          return (
            <div key={dow} className={styles.dayRow}>
              {/* Day name — sticky left */}
              <div className={styles.dayNameCell} style={{ height: TOTAL_H }}>
                <span className={styles.dayNameText}>{label}</span>
              </div>

              {/* Time gutter — sticky, second column */}
              <div className={styles.timeGutter} style={{ height: TOTAL_H }}>
                <div className={styles.timeGutterInner}>
                  {HOURS.map(h => (
                    <div key={h} className={styles.timeLabel} style={{ top: (h - MIN_HOUR) * HOUR_HEIGHT }}>
                      {String(h).padStart(2, '0')}
                    </div>
                  ))}
                </div>
              </div>

              {/* Hall columns */}
              {hallCols.map(hall => {
                const items = (dowMap.get(hall?.id ?? null) ?? []).sort((a, b) =>
                  a.time_of_day.localeCompare(b.time_of_day)
                )
                return (
                  <div
                    key={hall?.id ?? '__nohall'}
                    className={styles.cell}
                    style={{ height: TOTAL_H }}
                    onClick={onSlotClick ? e => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      const y = e.clientY - rect.top
                      const hour = Math.max(MIN_HOUR, Math.min(MAX_HOUR - 1, Math.floor(MIN_HOUR + y / HOUR_HEIGHT)))
                      onSlotClick(dow, `${String(hour).padStart(2, '0')}:00`, hall?.id ?? null)
                    } : undefined}
                  >
                    {HOURS.slice(1).map(h => (
                      <div key={h} className={styles.hourLine} style={{ top: (h - MIN_HOUR) * HOUR_HEIGHT }} />
                    ))}
                    {items.map(s => {
                      const trainerName = (s.trainers as { name: string } | null)?.name
                      const clientCount = s.series_clients?.length ?? 0
                      const capacity = s.capacity
                      const isFull = isClientCountFull(clientCount, capacity)
                      const isAlmost = isClientCountAlmost(clientCount, capacity)
                      const overCapacity = getOverCapacityCount(clientCount, capacity)
                      const endTime = (() => {
                        const [h, m] = s.time_of_day.split(':').map(Number)
                        const total = h * 60 + m + s.duration_min
                        return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
                      })()
                      return (
                        <button
                          key={s.id}
                          className={styles.chip}
                          style={{
                            top: cardTop(s.time_of_day),
                            height: cardHeight(s.duration_min),
                            ['--chip-color' as string]: typeColor(s.ticket_type),
                          }}
                          onClick={e => { e.stopPropagation(); onCardClick(s) }}
                        >
                          <span className={styles.chipTime}>{s.time_of_day.slice(0, 5)}–{endTime}</span>
                          <span className={styles.chipType}>{s.title || (typeLabel.get(s.ticket_type) ?? s.ticket_type)}</span>
                          {trainerName && <span className={styles.chipTrainer}>{trainerName}</span>}
                          {capacity != null && (
                            <span className={`${styles.chipCapacityBadge} ${isFull ? styles.chipCapacityFull : isAlmost ? styles.chipCapacityAlmost : ''}`}>
                              {clientCount}/{capacity}{overCapacity > 0 ? ` +${overCapacity}` : ''}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
