'use client'
import { useMemo } from 'react'
import { typeColor } from '@/lib/typeColor'
import type { ClassSeries, Hall, TrainingType } from '@/types'
import styles from './HallWeekGrid.module.css'

const DAYS: { label: string; dow: number }[] = [
  { label: 'Пн', dow: 1 },
  { label: 'Вт', dow: 2 },
  { label: 'Ср', dow: 3 },
  { label: 'Чт', dow: 4 },
  { label: 'Пт', dow: 5 },
  { label: 'Сб', dow: 6 },
  { label: 'Нд', dow: 0 },
]

const MIN_HOUR = 7
const MAX_HOUR = 23
const HOUR_HEIGHT = 64
const CARD_MIN_HEIGHT = 48
const HOURS = Array.from({ length: MAX_HOUR - MIN_HOUR }, (_, i) => MIN_HOUR + i)
const TOTAL_H = HOUR_HEIGHT * (MAX_HOUR - MIN_HOUR)

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
}

export default function HallWeekGrid({ series, halls, trainingTypes, onCardClick }: Props) {
  const activeHalls = useMemo(() => halls.filter(h => h.is_active), [halls])

  const typeLabel = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of trainingTypes) m.set(t.code, t.label)
    return m
  }, [trainingTypes])

  // hall_id (null = no hall) → dow → ClassSeries[]
  const byHallDay = useMemo(() => {
    const map = new Map<string | null, Map<number, ClassSeries[]>>()
    for (const hall of activeHalls) map.set(hall.id, new Map())
    map.set(null, new Map())
    for (const s of series) {
      const key = s.hall_id ?? null
      if (!map.has(key)) map.set(key, new Map())
      const dowMap = map.get(key)!
      if (!dowMap.has(s.day_of_week)) dowMap.set(s.day_of_week, [])
      dowMap.get(s.day_of_week)!.push(s)
    }
    return map
  }, [series, activeHalls])

  const noHallMap = byHallDay.get(null)
  const hasNoHall = noHallMap && Array.from(noHallMap.values()).some(a => a.length > 0)

  const hallRows = [
    ...activeHalls.map(h => ({ id: h.id, name: h.name, dowMap: byHallDay.get(h.id) ?? new Map<number, ClassSeries[]>() })),
    ...(hasNoHall ? [{ id: null as string | null, name: 'Без залу', dowMap: noHallMap! }] : []),
  ]

  return (
    <div className={styles.root}>
      {/* ── Sticky header: corner + day labels ── */}
      <div className={styles.stickyHeader}>
        <div className={styles.cornerCell} />
        <div className={styles.dayLabels}>
          {DAYS.map(d => (
            <div key={d.dow} className={styles.dayLabel}>{d.label}</div>
          ))}
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className={styles.scrollBody}>
        {/* Time axis */}
        <div className={styles.timeAxis} style={{ height: TOTAL_H }}>
          {HOURS.map(h => (
            <div key={h} className={styles.timeLabel} style={{ top: (h - MIN_HOUR) * HOUR_HEIGHT }}>
              {String(h).padStart(2, '0')}
            </div>
          ))}
        </div>

        {/* Hall rows */}
        <div className={styles.hallRows}>
          {hallRows.map(hall => (
            <div key={hall.id ?? '__nohall'} className={styles.hallRow}>
              {/* Hall name */}
              <div className={styles.hallName}>{hall.name}</div>

              {/* Day cells */}
              <div className={styles.dayCells}>
                {DAYS.map(d => {
                  const items = (hall.dowMap.get(d.dow) ?? []).sort((a, b) =>
                    a.time_of_day.localeCompare(b.time_of_day)
                  )
                  return (
                    <div key={d.dow} className={styles.cell} style={{ height: TOTAL_H }}>
                      {/* Hour lines */}
                      {HOURS.slice(1).map(h => (
                        <div
                          key={h}
                          className={styles.hourLine}
                          style={{ top: (h - MIN_HOUR) * HOUR_HEIGHT }}
                        />
                      ))}
                      {/* Cards */}
                      {items.map(s => {
                        const trainerName = (s.trainers as { name: string } | null)?.name
                        const clientCount = s.series_clients?.length ?? 0
                        const capacity = s.capacity
                        return (
                          <button
                            key={s.id}
                            className={styles.chip}
                            style={{
                              top: cardTop(s.time_of_day),
                              height: cardHeight(s.duration_min),
                              ['--chip-color' as string]: typeColor(s.ticket_type),
                            }}
                            onClick={() => onCardClick(s)}
                          >
                            <span className={styles.chipTime}>{s.time_of_day.slice(0, 5)}</span>
                            <span className={styles.chipType}>{typeLabel.get(s.ticket_type) ?? s.ticket_type}</span>
                            {trainerName && <span className={styles.chipTrainer}>{trainerName}</span>}
                            <span className={styles.chipCapacity}>
                              {clientCount}{capacity != null ? ` / ${capacity}` : ' пост.'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
