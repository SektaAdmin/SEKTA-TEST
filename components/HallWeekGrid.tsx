'use client'
import { useMemo } from 'react'
import { UserRound } from 'lucide-react'
import { typeColor } from '@/lib/typeColor'
import type { ClassSeries, Hall, TrainingType } from '@/types'
import {
  getOverCapacityCount,
  isClientCountFull,
  isClientCountAlmost,
  clientFillPct,
} from '@/lib/scheduleMetrics'
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

const MIN_HOUR = 8
const MAX_HOUR = 22
const HOUR_HEIGHT = 83
const CARD_GAP = 2
const CARD_MIN_HEIGHT = 36
const HOURS = Array.from({ length: MAX_HOUR - MIN_HOUR }, (_, i) => MIN_HOUR + i)
const TOTAL_H = HOUR_HEIGHT * (MAX_HOUR - MIN_HOUR)
const TIME_GUTTER_W = 48

function cardTop(timeOfDay: string): number {
  const [h, m] = timeOfDay.split(':').map(Number)
  return (h - MIN_HOUR + m / 60) * HOUR_HEIGHT
}

function cardHeight(durationMin: number): number {
  return Math.max((durationMin / 60) * HOUR_HEIGHT, CARD_MIN_HEIGHT)
}

function endTime(timeOfDay: string, durationMin: number): string {
  const [h, m] = timeOfDay.split(':').map(Number)
  const total = h * 60 + m + durationMin
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

interface Props {
  series: ClassSeries[]
  halls: Hall[]
  trainingTypes: TrainingType[]
  onCardClick: (s: ClassSeries) => void
  onSlotClick?: (dow: number, time: string, hallId: string | null) => void
}

// ── Template card ─────────────────────────────────────────────────
interface CardProps {
  s: ClassSeries
  typeLabel: string
  height: number
  top: number
  onCardClick: (s: ClassSeries) => void
}

function TemplateCard({ s, typeLabel, height, top, onCardClick }: CardProps) {
  const color = typeColor(s.ticket_type)
  const clientCount = s.series_clients?.length ?? 0
  const capacity = s.capacity
  const isFull = isClientCountFull(clientCount, capacity)
  const isAlmost = isClientCountAlmost(clientCount, capacity)
  const overCapacity = getOverCapacityCount(clientCount, capacity)
  const isCompact = height < 60
  const label = s.title || typeLabel
  const trainerName = (s.trainers as { name: string } | null)?.name
  const timeStart = s.time_of_day.slice(0, 5)
  const timeEnd = endTime(s.time_of_day, s.duration_min)
  const timeLabel = `${timeStart}–${timeEnd}`

  const slotState = overCapacity > 0 ? 'over' : isFull ? 'full' : isAlmost ? 'almost' : 'free'

  const progressBar = capacity != null ? (
    <div className={styles.cardFooter}>
      <div
        className={`${styles.cardProgressBar} ${styles['cardBar_' + slotState]}`}
        style={{ width: clientFillPct(clientCount, capacity) }}
      />
    </div>
  ) : null

  return (
    <button
      data-card
      className={styles.card}
      style={{
        top: `${top + CARD_GAP}px`,
        height: `${Math.max(height - CARD_GAP * 2, 20)}px`,
        left: `${CARD_GAP}px`,
        right: `${CARD_GAP}px`,
        ['--card-color' as string]: color,
      }}
      onClick={e => { e.stopPropagation(); onCardClick(s) }}
    >
      {isCompact ? (
        <span className={styles.cardCompact}>{label} {timeStart}</span>
      ) : (
        <>
          <div className={styles.cardTitle}>{label}</div>
          <div className={styles.cardTime}>{timeLabel}</div>
          {trainerName && (
            <div className={styles.cardTrainerRow}>
              <UserRound className={styles.cardTrainerIcon} />
              <span>{trainerName}</span>
            </div>
          )}
          {capacity != null && (() => {
            const free = capacity - clientCount
            if (overCapacity > 0) {
              return (
                <div className={styles.cardSlotsWaitlist}>
                  Черга: <strong>{overCapacity}</strong>
                </div>
              )
            }
            if (free <= 0) {
              return <div className={styles.cardSlotsEmpty}>Немає місць</div>
            }
            const freeText = free === 1 ? 'місце' : free >= 2 && free <= 4 ? 'місця' : 'місць'
            return (
              <div className={styles.cardSlots}>
                <strong className={styles.cardSlotsCount}>{clientCount}</strong>
                <span className={styles.cardSlotsTotal}>/{capacity}</span>
                <span className={styles.cardSlotsSeparator}>|</span>
                <span className={styles.cardSlotsFree}>{free} {freeText}</span>
              </div>
            )
          })()}
        </>
      )}
      {progressBar}
    </button>
  )
}

// ── Hall sub-column ───────────────────────────────────────────────
interface HallSubColProps {
  items: ClassSeries[]
  typeLabels: Map<string, string>
  dow: number
  hallId: string | null
  onCardClick: (s: ClassSeries) => void
  onSlotClick?: (dow: number, time: string, hallId: string | null) => void
}

function HallSubCol({ items, typeLabels, dow, hallId, onCardClick, onSlotClick }: HallSubColProps) {
  function relYOverlapsCard(relY: number): boolean {
    return items.some(s => {
      const top = cardTop(s.time_of_day)
      const h = cardHeight(s.duration_min)
      return relY >= top && relY <= top + h
    })
  }

  return (
    <div
      className={styles.hallSubCol}
      style={{ height: TOTAL_H, '--hour-h': `${HOUR_HEIGHT}px` } as React.CSSProperties}
      onMouseMove={e => {
        if ((e.target as HTMLElement).closest('[data-card]')) {
          e.currentTarget.style.setProperty('--hover-show', '0')
          return
        }
        const rect = e.currentTarget.getBoundingClientRect()
        const relY = e.clientY - rect.top
        if (relYOverlapsCard(relY)) {
          e.currentTarget.style.setProperty('--hover-show', '0')
          return
        }
        const snapY = Math.floor(relY / HOUR_HEIGHT) * HOUR_HEIGHT
        e.currentTarget.style.setProperty('--hover-y', `${snapY}px`)
        e.currentTarget.style.setProperty('--hover-show', '1')
      }}
      onMouseLeave={e => e.currentTarget.style.setProperty('--hover-show', '0')}
      onClick={e => {
        if ((e.target as HTMLElement).closest('[data-card]')) return
        const rect = e.currentTarget.getBoundingClientRect()
        const relY = e.clientY - rect.top
        if (relYOverlapsCard(relY)) return
        if (!onSlotClick) return
        const hour = Math.max(MIN_HOUR, Math.min(MAX_HOUR - 1, Math.floor(MIN_HOUR + relY / HOUR_HEIGHT)))
        onSlotClick(dow, `${String(hour).padStart(2, '0')}:00`, hallId)
      }}
    >
      {HOURS.slice(1).map(h => (
        <div key={h} className={styles.hourLine} style={{ top: (h - MIN_HOUR) * HOUR_HEIGHT }} />
      ))}
      {items.map(s => (
        <TemplateCard
          key={s.id}
          s={s}
          typeLabel={typeLabels.get(s.ticket_type) ?? s.ticket_type}
          height={cardHeight(s.duration_min)}
          top={cardTop(s.time_of_day)}
          onCardClick={onCardClick}
        />
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function HallWeekGrid({ series, halls, trainingTypes, onCardClick, onSlotClick }: Props) {
  const activeHalls = useMemo(() => halls.filter(h => h.is_active), [halls])

  const typeLabels = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of trainingTypes) m.set(t.code, t.label)
    return m
  }, [trainingTypes])

  // Halls that actually appear in the series (+ null for no-hall)
  const hallCols = useMemo(() => {
    const hallIds = new Set(series.map(s => s.hall_id ?? null))
    const result: (Hall | null)[] = activeHalls.filter(h => hallIds.has(h.id))
    if (hallIds.has(null)) result.push(null)
    return result
  }, [series, activeHalls])

  // Index: dow → hallId → series[]
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

  return (
    <div className={styles.root}>
      {/* ── Sticky header: gutter | day columns ── */}
      <div className={styles.weekHeader}>
        <div className={styles.gutterCorner} style={{ width: TIME_GUTTER_W, flexShrink: 0 }} />
        {DAYS.map(({ label, dow }) => {
          const dowMap = byDowHall.get(dow)!
          const cols = hallCols.filter(h => dowMap.has(h?.id ?? null))
          const colCount = Math.max(cols.length, 1)
          return (
            <div key={dow} className={styles.dayHeader} style={{ flex: colCount }}>
              <span className={styles.dayHeaderText}>{label}</span>
              {cols.length > 1 && (
                <div className={styles.dayHallsRow}>
                  {cols.map(hall => (
                    <div key={hall?.id ?? '__nohall'} className={styles.dayHallLabel}>
                      {hall ? hall.name : 'Без залу'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Scrollable body ── */}
      <div className={styles.bodyWrapper} ref={undefined}>
        <div className={styles.bodyGrid}>
          {/* Time gutter */}
          <div className={styles.timeGutter} style={{ width: TIME_GUTTER_W }}>
            {HOURS.map(h => (
              <div key={h} className={styles.timeRow} style={{ height: HOUR_HEIGHT }}>
                <span className={styles.timeLabel}>{String(h).padStart(2, '0')}</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map(({ dow }) => {
            const dowMap = byDowHall.get(dow)!
            const cols = hallCols.filter(h => dowMap.has(h?.id ?? null))
            const effectiveCols = cols.length > 0 ? cols : [null as null | Hall]

            return (
              <div key={dow} className={styles.dayCol} style={{ flex: Math.max(cols.length, 1) }}>
                {effectiveCols.map(hall => {
                  const hallId = hall?.id ?? null
                  const items = (dowMap.get(hallId) ?? []).sort((a, b) =>
                    a.time_of_day.localeCompare(b.time_of_day)
                  )
                  return (
                    <HallSubCol
                      key={hallId ?? '__nohall'}
                      items={cols.length > 0 ? items : []}
                      typeLabels={typeLabels}
                      dow={dow}
                      hallId={cols.length > 0 ? hallId : null}
                      onCardClick={onCardClick}
                      onSlotClick={onSlotClick}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
