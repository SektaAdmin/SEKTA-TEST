'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listClassesForWeek, listDatesWithClasses } from '@/lib/queries/classes'
import { useRealtime } from '@/lib/useRealtime'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import ClassModal from '@/components/ClassModal'
import ClassDetailModal from '@/components/ClassDetailModal'
import { useRefs } from '@/contexts/RefsContext'
import type { Class } from '@/types'
import { getActiveCount, getWaitlistCount, isFull, isAlmost, fillPct } from '@/lib/scheduleMetrics'
import { MONTHS_UK_SHORT, MONTHS_UK_FULL, getISOWeek } from '@/lib/dateUtils'
import styles from './schedule.module.css'
import ScheduleRightPanel from '@/components/ScheduleRightPanel'
import Link from 'next/link'


const DAYS_UA = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
const DAYS_UA_FULL = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота', 'Неділя']

const MIN_HOUR = 8
const MAX_HOUR = 22
const HOURS = Array.from({ length: MAX_HOUR - MIN_HOUR }, (_, i) => MIN_HOUR + i)
const HOUR_HEIGHT = 64
const CARD_GAP = 2

type ClassWithJoins = Class & {
  trainers: { name: string } | null
  halls: { name: string } | null
  enrollments: { id: string; status: string }[]
}

type Hall = { id: string; name: string; capacity: number; description: string | null; is_active: boolean }

const TYPE_COLORS = [
  '#4285f4',
  '#0b8043',
  '#d2562b',
  '#8430ce',
  '#0097a7',
  '#e52592',
  '#f6ae2d',
  '#137333',
]

function typeColor(code: string): string {
  if (code === 'group') return '#4285f4'
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0
  return TYPE_COLORS[h % TYPE_COLORS.length]
}


function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatEndTime(iso: string, durationMin: number) {
  const d = new Date(new Date(iso).getTime() + durationMin * 60000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDayDate(d: Date) {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

function getCardTop(iso: string, hourHeight: number): number {
  const d = new Date(iso)
  return (d.getHours() - MIN_HOUR + d.getMinutes() / 60) * hourHeight
}

function getCardHeight(durationMin: number, hourHeight: number): number {
  return Math.max((durationMin / 60) * hourHeight, 36)
}

type LaneInfo = { laneIndex: number; laneCount: number }

function computeLanes(classes: ClassWithJoins[]): Map<string, LaneInfo> {
  if (classes.length === 0) return new Map()
  const sorted = [...classes].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  )
  const laneAssignments = new Map<string, number>()
  const laneEndTimes: number[] = []
  for (const cls of sorted) {
    const start = new Date(cls.starts_at).getTime()
    const end = start + cls.duration_min * 60000
    let assigned = -1
    for (let i = 0; i < laneEndTimes.length; i++) {
      if (laneEndTimes[i] <= start) { assigned = i; laneEndTimes[i] = end; break }
    }
    if (assigned === -1) { assigned = laneEndTimes.length; laneEndTimes.push(end) }
    laneAssignments.set(cls.id, assigned)
  }
  const result = new Map<string, LaneInfo>()
  for (const cls of sorted) {
    const start = new Date(cls.starts_at).getTime()
    const end = start + cls.duration_min * 60000
    let maxLane = laneAssignments.get(cls.id)!
    for (const other of sorted) {
      if (other.id === cls.id) continue
      const os = new Date(other.starts_at).getTime()
      const oe = os + other.duration_min * 60000
      if (os < end && oe > start) maxLane = Math.max(maxLane, laneAssignments.get(other.id)!)
    }
    result.set(cls.id, { laneIndex: laneAssignments.get(cls.id)!, laneCount: maxLane + 1 })
  }
  return result
}


function formatDayFull(d: Date) {
  const dayName = DAYS_UA_FULL[(d.getDay() + 6) % 7]
  return `${dayName}, ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

// ── Slot click → time calculation ────────────────────────────────
function slotTimeFromClick(e: React.MouseEvent<HTMLDivElement>, day: Date, hourHeight: number): string {
  const rect = e.currentTarget.getBoundingClientRect()
  const relY = e.clientY - rect.top
  const hour = Math.floor(relY / hourHeight) + MIN_HOUR
  const clampedH = Math.max(MIN_HOUR, Math.min(MAX_HOUR - 1, hour))
  const d = new Date(day)
  d.setHours(clampedH, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(clampedH)}:00`
}

// ── Card component ────────────────────────────────────────────────
interface CardProps {
  cls: ClassWithJoins
  typeLabels: Record<string, string>
  hourHeight: number
  laneIndex?: number
  laneCount?: number
  onClick: () => void
}

function ClassCard({ cls, typeLabels, hourHeight, laneIndex = 0, laneCount = 1, onClick }: CardProps) {
  const activeCount = getActiveCount(cls.enrollments)
  const waitlistCount = getWaitlistCount(cls.enrollments)
  const color = typeColor(cls.ticket_type)
  const full = isFull(cls.enrollments, cls.capacity)
  const almost = isAlmost(cls.enrollments, cls.capacity)

  const timeLabel = `${formatTime(cls.starts_at)} – ${formatEndTime(cls.starts_at, cls.duration_min)}`
  const cardHeight = getCardHeight(cls.duration_min, hourHeight)
  const isCompact = cardHeight < 50
  const label = cls.title || (typeLabels[cls.ticket_type] ?? cls.ticket_type)

  return (
    <button
      data-card
      className={`${styles.card} ${cls.is_cancelled ? styles.cardCancelled : ''}`}
      style={{
        top: `${getCardTop(cls.starts_at, hourHeight) + CARD_GAP}px`,
        height: `${Math.max(cardHeight - CARD_GAP * 2, 20)}px`,
        left: `calc(${(laneIndex / laneCount) * 100}% + ${CARD_GAP}px)`,
        right: `calc(${((laneCount - laneIndex - 1) / laneCount) * 100}% + ${CARD_GAP}px)`,
        ['--card-color' as string]: color,
      }}
      onClick={e => { e.stopPropagation(); onClick() }}
    >
      {isCompact ? (
        <span className={`${styles.cardCompact} ${cls.is_cancelled ? styles.cardTypeCancelled : ''}`}>
          {label} · {formatTime(cls.starts_at)}
        </span>
      ) : (
        <>
          <span className={`${styles.cardType} ${cls.is_cancelled ? styles.cardTypeCancelled : ''}`}>
            {label}
          </span>
          <span className={styles.cardTime}>{timeLabel}</span>
          {cls.trainers?.name && (
            <span className={styles.cardTrainer}>{cls.trainers.name}</span>
          )}
          {cls.capacity != null && (
            <span className={`${styles.countBadge} ${full ? styles.countBadgeFull : almost ? styles.countBadgeAlmost : ''}`}>
              {activeCount}/{cls.capacity}{waitlistCount > 0 ? ` +${waitlistCount}` : ''}
            </span>
          )}
        </>
      )}
    </button>
  )
}

// ── Hall sub-column with lane fallback ────────────────────────────
interface HallColProps {
  classes: ClassWithJoins[]
  typeLabels: Record<string, string>
  hourHeight: number
  day: Date
  onCardClick: (id: string) => void
  onSlotClick: (startsAt: string) => void
}

function HallSubCol({ classes, typeLabels, hourHeight, day, onCardClick, onSlotClick }: HallColProps) {
  const lanes = computeLanes(classes)

  return (
    <div
      className={styles.hallSubCol}
      style={{ '--hour-h': `${hourHeight}px` } as React.CSSProperties}
      onMouseMove={e => {
        if ((e.target as HTMLElement).closest('[data-card]')) {
          e.currentTarget.style.setProperty('--hover-show', '0')
          return
        }
        const rect = e.currentTarget.getBoundingClientRect()
        const relY = e.clientY - rect.top
        const snapY = Math.floor(relY / hourHeight) * hourHeight
        e.currentTarget.style.setProperty('--hover-y', `${snapY}px`)
        e.currentTarget.style.setProperty('--hover-show', '1')
      }}
      onMouseLeave={e => {
        e.currentTarget.style.setProperty('--hover-show', '0')
      }}
      onClick={e => onSlotClick(slotTimeFromClick(e, day, hourHeight))}
    >
      {HOURS.slice(1).map(h => (
        <div key={h} className={styles.hourLine} style={{ top: `${(h - MIN_HOUR) * hourHeight}px` }} />
      ))}
      {classes.map(cls => {
        const { laneIndex, laneCount } = lanes.get(cls.id) ?? { laneIndex: 0, laneCount: 1 }
        return (
          <ClassCard
            key={cls.id}
            cls={cls}
            typeLabels={typeLabels}
            hourHeight={hourHeight}
            laneIndex={laneIndex}
            laneCount={laneCount}
            onClick={() => onCardClick(cls.id)}
          />
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────
export default function SchedulePage() {
  const { trainers, halls, trainingTypes } = useRefs()
  const activeHalls = (halls as Hall[]).filter(h => h.is_active)

  const [tab, setTab] = useState<'schedule' | 'archive'>('schedule')
  const [baseDate, setBaseDate] = useState(() => new Date())
  const [classes, setClasses] = useState<ClassWithJoins[]>([])
  const [cancelledClasses, setCancelledClasses] = useState<ClassWithJoins[]>([])
  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [prefill, setPrefill] = useState<{ starts_at: string; hall_id?: string } | undefined>()
  const [detailClassId, setDetailClassId] = useState<string | null>(null)
  const [editClassId, setEditClassId] = useState<string | null>(null)
  const [nowTop, setNowTop] = useState<number | null>(null)
  const [filterHall, setFilterHall] = useState('')
  const [filterTrainer, setFilterTrainer] = useState('')
  const [hourHeight, setHourHeight] = useState(HOUR_HEIGHT)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [calActiveDates, setCalActiveDates] = useState<Set<string>>(new Set())
  const [calViewMonth, setCalViewMonth] = useState<{ year: number; month: number }>(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }
  })
  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  }, [])

  const { weekDays, weekStartISO, weekEndISO } = useMemo(() => {
    const d = new Date(baseDate); d.setHours(0, 0, 0, 0)
    const end = new Date(d); end.setHours(23, 59, 59, 999)
    return { weekDays: [d], weekStartISO: d.toISOString(), weekEndISO: end.toISOString() }
  }, [baseDate])

  const fetchClasses = useCallback(async () => {
    setLoading(true)
    const { active, cancelled } = await listClassesForWeek(supabase, weekStartISO, weekEndISO)
    setClasses(active as ClassWithJoins[])
    setCancelledClasses(cancelled as ClassWithJoins[])
    setLoading(false)
  }, [weekStartISO, weekEndISO])

  useEffect(() => { fetchClasses() }, [fetchClasses])

  useRealtime(['classes', 'enrollments'], fetchClasses)

  useEffect(() => {
    setCalViewMonth({ year: baseDate.getFullYear(), month: baseDate.getMonth() })
  }, [baseDate.getFullYear(), baseDate.getMonth()])

  useEffect(() => {
    const { year, month } = calViewMonth
    const start = new Date(year, month, 1)
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999)
    listDatesWithClasses(supabase, start.toISOString(), end.toISOString()).then(setCalActiveDates)
  }, [calViewMonth])

  useEffect(() => {
    const map: Record<string, string> = {}
    for (const t of trainingTypes) map[t.code] = t.label
    setTypeLabels(map)
  }, [trainingTypes])

  useEffect(() => {
    function updateNow() {
      const now = new Date()
      const h = now.getHours() + now.getMinutes() / 60
      setNowTop(h >= MIN_HOUR && h < MAX_HOUR ? (h - MIN_HOUR) * hourHeight : null)
    }
    updateNow()
    const id = setInterval(updateNow, 60000)
    return () => clearInterval(id)
  }, [hourHeight])

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const totalHours = MAX_HOUR - MIN_HOUR
    const obs = new ResizeObserver(entries => {
      const h = entries[0].contentRect.height
      setHourHeight(Math.max(HOUR_HEIGHT, Math.floor(h / totalHours)))
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Apply filters
  const filteredClasses = useMemo(() => {
    let result = classes
    if (filterHall) result = result.filter(c => c.hall_id === filterHall)
    if (filterTrainer) result = result.filter(c => c.trainer_id === filterTrainer)
    return result
  }, [classes, filterHall, filterTrainer])

  // Halls that appear in the current view (filtered)
  const visibleHalls = useMemo(() => {
    const hallIds = new Set(filteredClasses.map(c => c.hall_id).filter(Boolean))
    const visHalls = filterHall
      ? activeHalls.filter(h => h.id === filterHall)
      : activeHalls.filter(h => hallIds.has(h.id))
    const hasNoHall = filteredClasses.some(c => !c.hall_id)
    return { halls: visHalls, hasNoHall }
  }, [filteredClasses, activeHalls, filterHall])

  const hallColumns = useMemo(() => [
    ...visibleHalls.halls,
    ...(visibleHalls.hasNoHall ? [null as null] : []),
  ], [visibleHalls])

  // Navigation
  function goNext() {
    setBaseDate(d => { const n = new Date(d); n.setDate(d.getDate() + 1); return n })
  }
  function goPrev() {
    setBaseDate(d => { const n = new Date(d); n.setDate(d.getDate() - 1); return n })
  }

  const navLabel = formatDayFull(weekDays[0])

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className={styles.layout}>
      <Sidebar />
      <BottomNav />
      <main className={styles.main}>

        {/* Topbar row 1 */}
        <div className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <div className={styles.dateChip}>
              <span className={styles.dateChipDay}>{baseDate.getDate()}</span>
            </div>

            <div className={styles.titleBlock}>
              <div className={styles.titleRow}>
                <span className={styles.monthTitle}>{MONTHS_UK_FULL[baseDate.getMonth()]} {baseDate.getFullYear()}</span>
              </div>
              <span className={styles.dayLabel}>{DAYS_UA_FULL[(baseDate.getDay() + 6) % 7].toLowerCase()}</span>
            </div>
          </div>

          <div className={styles.topbarRight}>
            <button className={styles.navBtn} onClick={goPrev} aria-label="Назад">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 2L4 7l5 5"/>
              </svg>
            </button>
            <button className={styles.todayBtn} onClick={() => setBaseDate(new Date())}>
              Сьогодні
            </button>
            <button className={styles.navBtn} onClick={goNext} aria-label="Вперед">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 2l5 5-5 5"/>
              </svg>
            </button>
            {tab === 'schedule' && (
              <button className={styles.btnNew} onClick={() => { setPrefill(undefined); setShowModal(true) }}>
                + Заняття
              </button>
            )}
          </div>
        </div>

        {/* Filter bar — only for schedule tab */}
        {tab === 'schedule' && (
          <div className={styles.filterBar}>
            <div className={styles.filterGroup}>
              <button
                className={`${styles.filterBtn} ${filterHall === '' ? styles.filterBtnActive : ''}`}
                onClick={() => setFilterHall('')}
              >
                Всі зали
              </button>
              {activeHalls.map(h => (
                <button
                  key={h.id}
                  className={`${styles.filterBtn} ${filterHall === h.id ? styles.filterBtnActive : ''}`}
                  onClick={() => setFilterHall(f => f === h.id ? '' : h.id)}
                >
                  {h.name}
                </button>
              ))}
            </div>
            <div className={styles.filterDivider} />
            <div className={styles.filterGroup}>
              <button
                className={`${styles.filterBtn} ${filterTrainer === '' ? styles.filterBtnActive : ''}`}
                onClick={() => setFilterTrainer('')}
              >
                Всі тренери
              </button>
              {(trainers as { id: string; name: string; is_active: boolean }[])
                .filter(t => t.is_active)
                .map(t => (
                  <button
                    key={t.id}
                    className={`${styles.filterBtn} ${filterTrainer === t.id ? styles.filterBtnActive : ''}`}
                    onClick={() => setFilterTrainer(f => f === t.id ? '' : t.id)}
                  >
                    {t.name}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Content row — grid area + right panel */}
        <div className={styles.contentRow}>
          <div className={styles.gridArea}>
            {/* Archive tab */}
            {tab === 'archive' && (
              <div className={styles.archiveList}>
            {loading ? (
              <div className={styles.archiveEmpty}>Завантаження...</div>
            ) : cancelledClasses.length === 0 ? (
              <div className={styles.archiveEmpty}>Скасованих занять за цей період немає</div>
            ) : cancelledClasses.map(cls => {
              const activeCount = getActiveCount(cls.enrollments)
              const start = new Date(cls.starts_at)
              const end = new Date(start.getTime() + cls.duration_min * 60000)
              const timeStr = `${formatTime(cls.starts_at)}–${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
              const dayStr = `${DAYS_UA[(start.getDay() + 6) % 7]}, ${formatDayDate(start)}`
              return (
                <button
                  key={cls.id}
                  className={styles.archiveRow}
                  onClick={() => setDetailClassId(cls.id)}
                >
                  <span className={styles.archiveDate}>{dayStr}</span>
                  <span className={styles.archiveTime}>{timeStr}</span>
                  <span className={styles.archiveType} style={{ color: typeColor(cls.ticket_type) }}>
                    {typeLabels[cls.ticket_type] ?? cls.ticket_type}
                    {cls.title ? ` · ${cls.title}` : ''}
                  </span>
                  {cls.trainers && <span className={styles.archiveMeta}>{cls.trainers.name}</span>}
                  {cls.trainers && cls.halls && <span className={styles.archiveMetaSep}>·</span>}
                  {cls.halls && <span className={styles.archiveMeta}>{cls.halls.name}</span>}
                  <span className={styles.archiveCount}>{activeCount} записані</span>
                </button>
              )
            })}
            </div>
            )}

            {/* Schedule grid */}
            {tab === 'schedule' && (
              <div className={styles.gridCard}>
            <div className={styles.gridScrollWrap}>
            {/* Day header */}
            <div className={styles.weekHeader} style={{ gridTemplateColumns: `48px 1fr` }}>
              <div className={styles.gutterCorner} />
              {weekDays.map((day, di) => {
                const isToday = isSameDay(day, today)
                return (
                  <div key={di} className={`${styles.dayHeader} ${isToday ? styles.dayHeaderToday : ''}`}>
                    {hallColumns.length > 1 && (
                      <div className={styles.dayHallsRow}>
                        {hallColumns.map(h => (
                          <span key={h?.id ?? 'none'} className={styles.dayHallLabel}>
                            {h ? h.name : '—'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Body grid */}
            <div className={styles.bodyGridWrapper} ref={wrapperRef}>
            <div className={styles.bodyGrid} style={{ gridTemplateColumns: `48px 1fr` }}>
              {/* Now line overlay — full width */}
              {nowTop !== null && (
                <div className={styles.nowLineOverlay} style={{ top: `${nowTop}px` }}>
                  <span className={styles.nowLineTime}>
                    {(() => { const n = new Date(); return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}` })()}
                  </span>
                  <div className={styles.nowLineLine} />
                </div>
              )}

              {/* Time gutter */}
              <div className={styles.timeGutter}>
                {HOURS.map(h => (
                  <div key={h} className={styles.timeRow} style={{ height: `${hourHeight}px` }}>
                    <span className={styles.timeLabel}>{String(h).padStart(2, '0')}:00</span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day, di) => {
                const dayClasses = filteredClasses.filter(c => isSameDay(new Date(c.starts_at), day))

                const dayHallCols = hallColumns

                const showHallCols = dayHallCols.length > 0

                return (
                  <div key={di} className={styles.dayCol} style={{ height: `${(MAX_HOUR - MIN_HOUR) * hourHeight}px` }}>
                    {showHallCols ? (
                      // Hall sub-columns
                      dayHallCols.map(hall => {
                        const hallClasses = hall === null
                          ? dayClasses.filter(c => !c.hall_id)
                          : dayClasses.filter(c => c.hall_id === hall.id)
                        return (
                          <HallSubCol
                            key={hall?.id ?? 'no-hall'}
                            classes={hallClasses}
                            typeLabels={typeLabels}
                            hourHeight={hourHeight}
                            day={day}
                            onCardClick={id => setDetailClassId(id)}
                            onSlotClick={startsAt => {
                              setPrefill({ starts_at: startsAt, hall_id: hall?.id })
                              setShowModal(true)
                            }}
                          />
                        )
                      })
                    ) : (
                      // Empty day — single sub-col for hour lines
                      <HallSubCol
                        key="empty"
                        classes={[]}
                        typeLabels={typeLabels}
                        hourHeight={hourHeight}
                        day={day}
                        onCardClick={() => {}}
                        onSlotClick={startsAt => {
                          setPrefill({ starts_at: startsAt })
                          setShowModal(true)
                        }}
                      />
                    )}
                  </div>
                )
              })}
                </div>
              </div>
              </div>
            </div>
            )}
          </div>

          {/* Right panel — schedule tab only */}
          {tab === 'schedule' && (
            <ScheduleRightPanel
              viewYear={calViewMonth.year}
              viewMonth={calViewMonth.month}
              onPrevMonth={() => setCalViewMonth(m => {
                const newMonth = m.month === 0 ? 11 : m.month - 1
                const newYear = m.month === 0 ? m.year - 1 : m.year
                return { year: newYear, month: newMonth }
              })}
              onNextMonth={() => setCalViewMonth(m => {
                const newMonth = m.month === 11 ? 0 : m.month + 1
                const newYear = m.month === 11 ? m.year + 1 : m.year
                return { year: newYear, month: newMonth }
              })}
              activeDates={calActiveDates}
              selectedDate={baseDate}
              onDateSelect={setBaseDate}
              detailClassId={detailClassId}
              onDetailClose={() => setDetailClassId(null)}
              onEditDetail={() => detailClassId && setEditClassId(detailClassId)}
              onClassUpdated={fetchClasses}
            />
          )}
        </div>
      </main>

      {editClassId && (
        <ClassDetailModal
          classId={editClassId}
          onClose={() => setEditClassId(null)}
          onClassUpdated={() => { fetchClasses(); setEditClassId(null) }}
        />
      )}

      {showModal && (
        <ClassModal
          onClose={() => { setShowModal(false); setPrefill(undefined) }}
          onSaved={() => {
            setShowModal(false); setPrefill(undefined); fetchClasses()
            setCalViewMonth(m => ({ ...m })) // re-trigger active dates fetch
          }}
          prefill={prefill}
        />
      )}
    </div>
  )
}
