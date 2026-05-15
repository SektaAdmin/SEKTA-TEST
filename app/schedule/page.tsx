'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import ClassModal from '@/components/ClassModal'
import { useRefs } from '@/contexts/RefsContext'
import type { Class } from '@/types'
import { getActiveCount, getWaitlistCount, isFull, isAlmost, fillPct } from '@/lib/scheduleMetrics'
import styles from './schedule.module.css'


const DAYS_UA = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
const MONTHS_UA = ['Січ', 'Лют', 'Бер', 'Квіт', 'Трав', 'Черв', 'Лип', 'Серп', 'Вер', 'Жовт', 'Лист', 'Груд']

const MIN_HOUR = 7
const MAX_HOUR = 23
const HOURS = Array.from({ length: MAX_HOUR - MIN_HOUR }, (_, i) => MIN_HOUR + i)

type ViewMode = 'week' | 'day'

type ClassWithJoins = Class & {
  trainers: { name: string } | null
  halls: { name: string } | null
  enrollments: { id: string; status: string }[]
}

type Hall = { id: string; name: string; capacity: number; description: string | null; is_active: boolean }

const TYPE_COLORS = [
  '#5b8af5',
  '#c8f060',
  '#f07850',
  '#a06cf0',
  '#50c8d8',
  '#f0c840',
  '#e05080',
  '#60d890',
]

function typeColor(code: string): string {
  let h = 0
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0
  return TYPE_COLORS[h % TYPE_COLORS.length]
}

function getWeekDays(base: Date): Date[] {
  const d = new Date(base)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const copy = new Date(d)
    copy.setDate(d.getDate() + i)
    return copy
  })
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
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
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

function formatWeekRange(days: Date[]) {
  const s = days[0], e = days[6]
  if (s.getMonth() === e.getMonth()) {
    return `${s.getDate()}–${e.getDate()} ${MONTHS_UA[s.getMonth()]} ${s.getFullYear()}`
  }
  return `${s.getDate()} ${MONTHS_UA[s.getMonth()]} – ${e.getDate()} ${MONTHS_UA[e.getMonth()]} ${e.getFullYear()}`
}

function formatDayFull(d: Date) {
  return `${DAYS_UA[(d.getDay() + 6) % 7]}, ${d.getDate()} ${MONTHS_UA[d.getMonth()]} ${d.getFullYear()}`
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

  const fill = fillPct(cls.enrollments, cls.capacity)
  const timeLabel = `${formatTime(cls.starts_at)} – ${formatEndTime(cls.starts_at, cls.duration_min)}`
  const cardHeight = getCardHeight(cls.duration_min, hourHeight)
  const isCompact = cardHeight < 50
  const label = cls.title || (typeLabels[cls.ticket_type] ?? cls.ticket_type)

  const progressClass = full ? styles.cardProgressFull : almost ? styles.cardProgressAlmost : styles.cardProgress

  return (
    <button
      className={`${styles.card} ${cls.is_cancelled ? styles.cardCancelled : ''}`}
      style={{
        top: `${getCardTop(cls.starts_at, hourHeight)}px`,
        height: `${cardHeight}px`,
        left: `calc(${(laneIndex / laneCount) * 100}% + 4px)`,
        right: `calc(${((laneCount - laneIndex - 1) / laneCount) * 100}% + 4px)`,
        ['--card-color' as string]: color,
        ['--card-fill' as string]: fill,
      }}
      onClick={e => { e.stopPropagation(); onClick() }}
    >
      {cls.is_cancelled && <span className={styles.cancelledBadge}>скасовано</span>}
      <span className={`${styles.cardType} ${cls.is_cancelled ? styles.cardTypeCancelled : ''}`}>
        {label}
      </span>
      {isCompact ? (
        <span className={styles.cardTime}>{timeLabel}</span>
      ) : (
        <>
          <div className={styles.cardMeta}>
            <span className={styles.cardTime}>{timeLabel}</span>
            {cls.trainers?.name && <span className={styles.cardDot}>·</span>}
            <span className={styles.cardTrainer}>{cls.trainers?.name ?? ''}</span>
          </div>
          <div className={styles.cardFooter}>
            <span className={`${styles.cardCount} ${full ? styles.cardCountFull : almost ? styles.cardCountAlmost : ''}`}>
              {activeCount}{cls.capacity != null ? `/${cls.capacity}` : ''}
            </span>
            {waitlistCount > 0 && (
              <span className={styles.cardWaitlist}>+{waitlistCount} черга</span>
            )}
            {cls.halls?.name && (
              <span className={styles.cardHall}>{cls.halls.name.slice(0, 3).toUpperCase()}</span>
            )}
          </div>
        </>
      )}
      {cls.capacity != null && <div className={progressClass} />}
    </button>
  )
}

// ── Hall sub-column with lane fallback ────────────────────────────
interface HallColProps {
  classes: ClassWithJoins[]
  typeLabels: Record<string, string>
  hourHeight: number
  isToday: boolean
  nowTop: number | null
  day: Date
  onCardClick: (id: string) => void
  onSlotClick: (startsAt: string) => void
}

function HallSubCol({ classes, typeLabels, hourHeight, isToday, nowTop, day, onCardClick, onSlotClick }: HallColProps) {
  const lanes = computeLanes(classes)
  return (
    <div
      className={styles.hallSubCol}
      onClick={e => onSlotClick(slotTimeFromClick(e, day, hourHeight))}
    >
      {HOURS.slice(1).map(h => (
        <div key={h} className={styles.hourLine} style={{ top: `${(h - MIN_HOUR) * hourHeight}px` }} />
      ))}
      {nowTop !== null && isToday && (
        <div className={styles.nowLine} style={{ top: `${nowTop}px` }} />
      )}
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
  const router = useRouter()
  const { trainers, halls, trainingTypes } = useRefs()
  const activeHalls = (halls as Hall[]).filter(h => h.is_active)

  const [tab, setTab] = useState<'schedule' | 'archive'>('schedule')
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [baseDate, setBaseDate] = useState(() => new Date())
  const [classes, setClasses] = useState<ClassWithJoins[]>([])
  const [cancelledClasses, setCancelledClasses] = useState<ClassWithJoins[]>([])
  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [prefill, setPrefill] = useState<{ starts_at: string; hall_id?: string } | undefined>()
  const [nowTop, setNowTop] = useState<number | null>(null)
  const [filterHall, setFilterHall] = useState('')
  const [filterTrainer, setFilterTrainer] = useState('')
  const [hourHeight, setHourHeight] = useState(60)
  const filterBarRef = useRef<HTMLDivElement>(null)
  const weekHeaderRef = useRef<HTMLDivElement>(null)

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  }, [])

  // For week view: derive the week; for day view: single day
  const { weekDays, weekStartISO, weekEndISO } = useMemo(() => {
    if (viewMode === 'day') {
      const d = new Date(baseDate); d.setHours(0, 0, 0, 0)
      const end = new Date(d); end.setHours(23, 59, 59, 999)
      return { weekDays: [d], weekStartISO: d.toISOString(), weekEndISO: end.toISOString() }
    }
    const days = getWeekDays(baseDate)
    const end = new Date(days[6]); end.setHours(23, 59, 59, 999)
    return { weekDays: days, weekStartISO: days[0].toISOString(), weekEndISO: end.toISOString() }
  }, [baseDate, viewMode])

  const fetchClasses = useCallback(async () => {
    setLoading(true)
    const [activeRes, cancelledRes] = await Promise.all([
      supabase
        .from('classes')
        .select('*, trainers(name), halls(name), enrollments(id, status)')
        .gte('starts_at', weekStartISO)
        .lte('starts_at', weekEndISO)
        .eq('is_cancelled', false)
        .order('starts_at'),
      supabase
        .from('classes')
        .select('*, trainers(name), halls(name), enrollments(id, status)')
        .gte('starts_at', weekStartISO)
        .lte('starts_at', weekEndISO)
        .eq('is_cancelled', true)
        .order('starts_at'),
    ])
    if (activeRes.error) toast.error('Не вдалося завантажити розклад')
    else setClasses((activeRes.data ?? []) as ClassWithJoins[])
    if (!cancelledRes.error) setCancelledClasses((cancelledRes.data ?? []) as ClassWithJoins[])
    setLoading(false)
  }, [weekStartISO, weekEndISO])

  useEffect(() => { fetchClasses() }, [fetchClasses])

  useEffect(() => {
    const map: Record<string, string> = {}
    for (const t of trainingTypes) map[t.code] = t.label
    setTypeLabels(map)
  }, [trainingTypes])

  useEffect(() => {
    function calcHourHeight() {
      const topbarH = 57
      const filterH = filterBarRef.current?.offsetHeight ?? 0
      const weekH = weekHeaderRef.current?.offsetHeight ?? 0
      const totalHours = MAX_HOUR - MIN_HOUR
      const available = window.innerHeight - topbarH - filterH - weekH
      setHourHeight(Math.max(32, Math.floor(available / totalHours)))
    }
    // rAF ensures refs are populated after paint
    const raf = requestAnimationFrame(calcHourHeight)
    window.addEventListener('resize', calcHourHeight)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', calcHourHeight) }
  }, [tab, loading])

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
    setBaseDate(d => {
      const n = new Date(d)
      n.setDate(d.getDate() + (viewMode === 'day' ? 1 : 7))
      return n
    })
  }
  function goPrev() {
    setBaseDate(d => {
      const n = new Date(d)
      n.setDate(d.getDate() - (viewMode === 'day' ? 1 : 7))
      return n
    })
  }

  function switchToDay(day: Date) {
    setBaseDate(day)
    setViewMode('day')
  }

  const navLabel = viewMode === 'day'
    ? formatDayFull(weekDays[0])
    : formatWeekRange(weekDays)

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>

        {/* Topbar row 1 */}
        <div className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${tab === 'schedule' ? styles.tabActive : ''}`}
                onClick={() => setTab('schedule')}
              >
                Розклад
              </button>
              <button
                className={`${styles.tab} ${tab === 'archive' ? styles.tabActive : ''}`}
                onClick={() => setTab('archive')}
              >
                Архів
              </button>
            </div>
          </div>

          <div className={styles.weekNav}>
            <button className={styles.navBtn} onClick={goPrev} aria-label="Назад">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 2L4 7l5 5"/>
              </svg>
            </button>
            <span className={styles.weekRange}>{navLabel}</span>
            <button className={styles.navBtn} onClick={goNext} aria-label="Вперед">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 2l5 5-5 5"/>
              </svg>
            </button>
            <button className={styles.todayBtn} onClick={() => setBaseDate(new Date())}>
              Сьогодні
            </button>
          </div>

          <div className={styles.topbarRight}>
            {tab === 'schedule' && (
              <div className={styles.viewToggle}>
                <button
                  className={`${styles.viewBtn} ${viewMode === 'week' ? styles.viewBtnActive : ''}`}
                  onClick={() => setViewMode('week')}
                >
                  Тиждень
                </button>
                <button
                  className={`${styles.viewBtn} ${viewMode === 'day' ? styles.viewBtnActive : ''}`}
                  onClick={() => setViewMode('day')}
                >
                  День
                </button>
              </div>
            )}
            {tab === 'schedule' && (
              <button className={styles.btnNew} onClick={() => { setPrefill(undefined); setShowModal(true) }}>
                + Заняття
              </button>
            )}
          </div>
        </div>

        {/* Filter bar — only for schedule tab */}
        {tab === 'schedule' && (
          <div className={styles.filterBar} ref={filterBarRef}>
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
                  onClick={() => router.push(`/schedule/${cls.id}`)}
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
          <>
            {/* Week header */}
            <div className={styles.weekHeader} ref={weekHeaderRef} style={
              viewMode === 'week'
                ? { gridTemplateColumns: `48px repeat(7, 1fr)`, top: tab === 'schedule' ? '102px' : '57px' }
                : { gridTemplateColumns: `48px 1fr`, top: tab === 'schedule' ? '102px' : '57px' }
            }>
              <div className={styles.gutterCorner} />
              {weekDays.map((day, di) => {
                const isToday = isSameDay(day, today)
                const dayHalls = viewMode === 'week'
                  ? hallColumns.filter(h => {
                      const dayClasses = filteredClasses.filter(c => isSameDay(new Date(c.starts_at), day))
                      return h === null
                        ? dayClasses.some(c => !c.hall_id)
                        : dayClasses.some(c => c.hall_id === h.id)
                    })
                  : hallColumns
                return (
                  <div key={di} className={`${styles.dayHeader} ${isToday ? styles.dayHeaderToday : ''}`}>
                    <div className={styles.dayHeadTop}>
                      <button
                        className={styles.dayHeadBtn}
                        onClick={() => viewMode === 'week' && switchToDay(day)}
                        title={viewMode === 'week' ? 'Перейти до дня' : undefined}
                      >
                        <span className={styles.dayName}>{DAYS_UA[di]}</span>
                        <span className={styles.dayDate}>{formatDayDate(day)}</span>
                      </button>
                    </div>
                    {dayHalls.length > 1 && (
                      <div className={styles.dayHallsRow}>
                        {dayHalls.map(h => (
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
            <div className={styles.bodyGrid} style={
              viewMode === 'week'
                ? { gridTemplateColumns: `48px repeat(7, 1fr)` }
                : { gridTemplateColumns: `48px 1fr` }
            }>
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
                const isToday = isSameDay(day, today)
                const dayClasses = filteredClasses.filter(c => isSameDay(new Date(c.starts_at), day))

                // Which hall columns to show for this day
                const dayHallCols = viewMode === 'week'
                  ? hallColumns.filter(h => {
                      return h === null
                        ? dayClasses.some(c => !c.hall_id)
                        : dayClasses.some(c => c.hall_id === h.id)
                    })
                  : hallColumns

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
                            isToday={isToday}
                            nowTop={nowTop}
                            day={day}
                            onCardClick={id => router.push(`/schedule/${id}`)}
                            onSlotClick={startsAt => {
                              setPrefill({ starts_at: startsAt, hall_id: hall?.id })
                              setShowModal(true)
                            }}
                          />
                        )
                      })
                    ) : (
                      // Empty day — single sub-col for hour lines + now line
                      <HallSubCol
                        key="empty"
                        classes={[]}
                        typeLabels={typeLabels}
                        hourHeight={hourHeight}
                        isToday={isToday}
                        nowTop={nowTop}
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
          </>
        )}
      </main>

      {showModal && (
        <ClassModal
          onClose={() => { setShowModal(false); setPrefill(undefined) }}
          onSaved={() => { setShowModal(false); setPrefill(undefined); fetchClasses() }}
          prefill={prefill}
        />
      )}
    </div>
  )
}
