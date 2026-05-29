'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import * as SelectPrimitive from '@radix-ui/react-select'
import { ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { listClassesForWeek, listDatesWithClasses } from '@/lib/queries/classes'
import { listEnrollmentsForClass } from '@/lib/queries/enrollments'
import { typeColor } from '@/lib/typeColor'
import { useRealtime } from '@/lib/useRealtime'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import ClassModal from '@/components/ClassModal'
import ClassDetailModal from '@/components/ClassDetailModal'
import { useRefs } from '@/contexts/RefsContext'
import type { Class } from '@/types'
import { getActiveCount, getWaitlistCount, isFull } from '@/lib/scheduleMetrics'
import { MONTHS_UK_SHORT, MONTHS_UK_FULL, getISOWeek, WEEKDAYS_SHORT, WEEKDAYS_FULL, dowMondayIndex } from '@/lib/dateUtils'
import { formatDate, formatDateShort } from '@/lib/formatters'
import styles from './schedule.module.css'
import ScheduleRightPanel from '@/components/ScheduleRightPanel'
import { useIsMobile } from '@/hooks/useIsMobile'
import Link from 'next/link'

const MIN_HOUR = 8
const MAX_HOUR = 22
const HOURS = Array.from({ length: MAX_HOUR - MIN_HOUR }, (_, i) => MIN_HOUR + i)
const HOUR_HEIGHT = 83
const CARD_GAP = 2

type ClassWithJoins = Class & {
  trainers: { name: string } | null
  halls: { name: string } | null
  enrollments: { id: string; status: string }[]
}

type Hall = { id: string; name: string; capacity: number; description: string | null; is_active: boolean }

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
  const dayName = WEEKDAYS_FULL[dowMondayIndex(d)]
  return `${dayName}, ${formatDate(d)}`
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

// ── Filter select ─────────────────────────────────────────────────
const ALL = '__all__'
interface FilterSelectProps {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: { value: string; label: string }[]
}
function FilterSelect({ value, onChange, placeholder, options }: FilterSelectProps) {
  const radixValue = value === '' ? ALL : value
  return (
    <SelectPrimitive.Root value={radixValue} onValueChange={v => onChange(v === ALL ? '' : v)}>
      <SelectPrimitive.Trigger className={styles.fsTrigger} aria-label={placeholder}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className={styles.fsChevron} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className={styles.fsContent} position="popper" sideOffset={4}>
          <SelectPrimitive.Viewport>
            {options.map(o => (
              <SelectPrimitive.Item
                key={o.value === '' ? ALL : o.value}
                value={o.value === '' ? ALL : o.value}
                className={styles.fsItem}
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

// ── Card hover tooltip ────────────────────────────────────────────
type TooltipEnrollment = {
  id: string
  status: string
  clients: { first_name: string | null; last_name: string | null } | null
}

interface CardTooltipProps {
  classId: string
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
  onMouseEnter: () => void
}

const TOOLTIP_W = 220
const TOOLTIP_MAX_H = 320

function CardTooltip({ classId, anchorRef, onClose, onMouseEnter }: CardTooltipProps) {
  const [enrollments, setEnrollments] = useState<TooltipEnrollment[] | null>(null)
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number; bottom?: number }>({ top: 0, left: 0 })
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listEnrollmentsForClass(supabase, classId).then(data => {
      setEnrollments(data as TooltipEnrollment[])
    })
  }, [classId])

  useEffect(() => {
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const winW = window.innerWidth
    const winH = window.innerHeight
    const GAP = 8

    // horizontal: prefer right, fall back to left
    const fitsRight = rect.right + GAP + TOOLTIP_W <= winW
    const leftVal = fitsRight ? rect.right + GAP : undefined
    const rightVal = fitsRight ? undefined : winW - rect.left + GAP

    // vertical: prefer top-aligned with card, flip up if overflows bottom
    const fitsDown = rect.top + TOOLTIP_MAX_H <= winH - 8
    const topVal = fitsDown ? rect.top : undefined
    const bottomVal = fitsDown ? undefined : winH - rect.bottom

    setPos({ top: topVal ?? 0, left: leftVal, right: rightVal, bottom: bottomVal })
  }, [anchorRef])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        tooltipRef.current && !tooltipRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose, anchorRef])

  const active = enrollments?.filter(e => e.status === 'enrolled' || e.status === 'attended') ?? []
  const waitlist = enrollments?.filter(e => e.status === 'waitlist') ?? []

  const clientName = (e: TooltipEnrollment) => {
    const fn = e.clients?.first_name ?? ''
    const ln = e.clients?.last_name ?? ''
    return [fn, ln].filter(Boolean).join(' ') || '—'
  }

  const statusDot: Record<string, string> = {
    enrolled: styles.tooltipDotEnrolled,
    attended: styles.tooltipDotAttended,
    waitlist: styles.tooltipDotWaitlist,
  }

  return createPortal(
    <div
      ref={tooltipRef}
      className={styles.cardTooltip}
      style={{
        top: pos.bottom !== undefined ? 'auto' : pos.top,
        bottom: pos.bottom !== undefined ? pos.bottom : 'auto',
        left: pos.left,
        right: pos.right,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onClose}
    >
      {enrollments === null ? (
        <div className={styles.tooltipLoading}>Завантаження...</div>
      ) : enrollments.length === 0 ? (
        <div className={styles.tooltipEmpty}>Немає записів</div>
      ) : (
        <>
          {active.length > 0 && (
            <div className={styles.tooltipSection}>
              <div className={styles.tooltipSectionHead}>
                Записані ({active.length})
              </div>
              {active.map((e, i) => (
                <div key={e.id} className={styles.tooltipRow}>
                  <span className={styles.tooltipNum}>{i + 1}</span>
                  <span className={`${styles.tooltipDot} ${statusDot[e.status] ?? ''}`} />
                  <span className={styles.tooltipName}>{clientName(e)}</span>
                </div>
              ))}
            </div>
          )}
          {waitlist.length > 0 && (
            <div className={styles.tooltipSection}>
              <div className={styles.tooltipSectionHead}>
                Резерв ({waitlist.length})
              </div>
              {waitlist.map((e, i) => (
                <div key={e.id} className={styles.tooltipRow}>
                  <span className={styles.tooltipNum}>{i + 1}</span>
                  <span className={`${styles.tooltipDot} ${styles.tooltipDotWaitlist}`} />
                  <span className={styles.tooltipName}>{clientName(e)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>,
    document.body
  )
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

  const cardHeight = getCardHeight(cls.duration_min, hourHeight)
  const isCompact = cardHeight < 60
  const label = cls.title || (typeLabels[cls.ticket_type] ?? cls.ticket_type)

  const [showTooltip, setShowTooltip] = useState(false)
  const cardRef = useRef<HTMLButtonElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMobile = useIsMobile()

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  const scheduleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => setShowTooltip(false), 120)
  }, [])

  const handleMouseEnter = useCallback(() => {
    if (isMobile) return
    cancelClose()
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setShowTooltip(true), 250)
  }, [isMobile, cancelClose])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    scheduleClose()
  }, [scheduleClose])

  return (
    <button
      ref={cardRef}
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
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {showTooltip && (
        <CardTooltip
          classId={cls.id}
          anchorRef={cardRef}
          onMouseEnter={cancelClose}
          onClose={scheduleClose}
        />
      )}
      {isCompact ? (
        <span className={`${styles.cardCompact} ${cls.is_cancelled ? styles.cardTitleCancelled : ''}`}>
          {label} {formatTime(cls.starts_at)}
        </span>
      ) : (
        <>
          <div className={`${styles.cardTitle} ${cls.is_cancelled ? styles.cardTitleCancelled : ''}`}>
            {label}
          </div>
          {cls.trainers?.name && (
            <div className={styles.cardTrainerRow}>
              {cls.trainers.name}
            </div>
          )}
          {cls.capacity != null && !cls.is_cancelled && (() => {
            const free = cls.capacity - activeCount
            if (waitlistCount > 0) {
              return (
                <div className={styles.cardSlotsWaitlist}>
                  Резерв: <strong>{waitlistCount}</strong>
                </div>
              )
            }
            if (free <= 0) {
              return <div className={styles.cardSlotsEmpty}>Немає місць</div>
            }
            const freeText = free === 1 ? 'місце' : free >= 2 && free <= 4 ? 'місця' : 'місць'
            return (
              <div className={styles.cardSlots}>
                <strong className={styles.cardSlotsCount}>{activeCount}</strong>
                <span className={styles.cardSlotsTotal}>/{cls.capacity}</span>
                <span className={styles.cardSlotsSeparator}>·</span>
                <span className={styles.cardSlotsFree}>{free} {freeText}</span>
              </div>
            )
          })()}
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

  function relYOverlapsCard(relY: number): boolean {
    return classes.some(cls => {
      const top = getCardTop(cls.starts_at, hourHeight)
      const height = getCardHeight(cls.duration_min, hourHeight)
      return relY >= top && relY <= top + height
    })
  }

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
        if (relYOverlapsCard(relY)) {
          e.currentTarget.style.setProperty('--hover-show', '0')
          return
        }
        const snapY = Math.floor(relY / hourHeight) * hourHeight
        e.currentTarget.style.setProperty('--hover-y', `${snapY}px`)
        e.currentTarget.style.setProperty('--hover-show', '1')
      }}
      onMouseLeave={e => {
        e.currentTarget.style.setProperty('--hover-show', '0')
      }}
      onClick={e => {
        if ((e.target as HTMLElement).closest('[data-card]')) return
        const rect = e.currentTarget.getBoundingClientRect()
        const relY = e.clientY - rect.top
        if (relYOverlapsCard(relY)) return
        onSlotClick(slotTimeFromClick(e, day, hourHeight))
      }}
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

  const ARCHIVE_CUTOFF_DAYS = 30
  const isMobile = useIsMobile()
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day')

  // Force day view on mobile (week view causes horizontal overflow on small screens)
  useEffect(() => {
    if (isMobile && viewMode === 'week') setViewMode('day')
  }, [isMobile, viewMode])
  const [baseDate, setBaseDate] = useState(() => new Date())
  const [classes, setClasses] = useState<ClassWithJoins[]>([])
  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [prefill, setPrefill] = useState<{ starts_at: string; hall_id?: string } | undefined>()
  const [editClassId, setEditClassId] = useState<string | null>(null)
  const [nowTop, setNowTop] = useState<number | null>(null)
  const [filterHall, setFilterHall] = useState('')
  const [filterTrainer, setFilterTrainer] = useState('')
  const [hourHeight, setHourHeight] = useState(HOUR_HEIGHT)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const swipeRef = useRef<{ startX: number; startY: number; decided: boolean } | null>(null)
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null)
  const gridCardRef = useRef<HTMLDivElement>(null)
  const [calActiveDates, setCalActiveDates] = useState<Set<string>>(new Set())
  const [calViewMonth, setCalViewMonth] = useState<{ year: number; month: number }>(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [showMobileCal, setShowMobileCal] = useState(false)
  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  }, [])

  const { weekDays, weekStartISO, weekEndISO } = useMemo(() => {
    const d = new Date(baseDate); d.setHours(0, 0, 0, 0)

    let days: Date[]
    if (viewMode === 'day') {
      days = [d]
    } else {
      // Week view: Monday to Sunday
      const dayOfWeek = d.getDay()
      const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      const mon = new Date(d); mon.setDate(d.getDate() - daysBack)
      days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(mon); date.setDate(mon.getDate() + i)
        return date
      })
    }

    const start = new Date(days[0]); start.setHours(0, 0, 0, 0)
    const end = new Date(days[days.length - 1]); end.setHours(23, 59, 59, 999)

    return { weekDays: days, weekStartISO: start.toISOString(), weekEndISO: end.toISOString() }
  }, [baseDate, viewMode])

  const fetchClasses = useCallback(async () => {
    setLoading(true)
    const { active } = await listClassesForWeek(supabase, weekStartISO, weekEndISO)
    setClasses(active as ClassWithJoins[])
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

  // Navigation with slide animation
  const navigateDay = useCallback((dir: 'left' | 'right') => {
    if (!isMobile) {
      // Desktop — no animation, just change date
      if (dir === 'left') {
        const step = viewMode === 'week' ? 7 : 1
        setBaseDate(d => { const n = new Date(d); n.setDate(d.getDate() + step); return n })
      } else {
        const step = viewMode === 'week' ? 7 : 1
        setBaseDate(d => {
          const n = new Date(d); n.setDate(d.getDate() - step)
          const t = new Date(); t.setHours(0,0,0,0)
          const cutoff = new Date(t); cutoff.setDate(t.getDate() - ARCHIVE_CUTOFF_DAYS)
          return n < cutoff ? new Date() : n
        })
      }
      return
    }
    // Mobile — slide out, swap date, slide in
    setSlideDir(dir)
    setTimeout(() => {
      if (dir === 'left') {
        setBaseDate(d => { const n = new Date(d); n.setDate(d.getDate() + 1); return n })
      } else {
        setBaseDate(d => {
          const n = new Date(d); n.setDate(d.getDate() - 1)
          const t = new Date(); t.setHours(0,0,0,0)
          const cutoff = new Date(t); cutoff.setDate(t.getDate() - ARCHIVE_CUTOFF_DAYS)
          return n < cutoff ? new Date() : n
        })
      }
      setSlideDir(null)
    }, 180)
  }, [isMobile, viewMode])

  const goNext = useCallback(() => navigateDay('left'),  [navigateDay])
  const goPrev = useCallback(() => navigateDay('right'), [navigateDay])

  // Swipe to change day (mobile)
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    function onTouchStart(e: TouchEvent) {
      swipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, decided: false }
    }

    function onTouchMove(e: TouchEvent) {
      const s = swipeRef.current
      if (!s) return
      const dx = e.touches[0].clientX - s.startX
      const dy = e.touches[0].clientY - s.startY
      if (!s.decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        s.decided = true
        if (Math.abs(dx) <= Math.abs(dy)) { swipeRef.current = null; return }
      }
      e.preventDefault()
    }

    function onTouchEnd(e: TouchEvent) {
      const s = swipeRef.current
      swipeRef.current = null
      if (!s || !s.decided) return
      const dx = e.changedTouches[0].clientX - s.startX
      if (Math.abs(dx) < 50) return
      if (dx < 0) goNext()
      else goPrev()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [goNext, goPrev])

  const isPrevDisabled = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const cutoff = new Date(today)
    cutoff.setDate(today.getDate() - ARCHIVE_CUTOFF_DAYS)
    const checkDate = new Date(baseDate)
    checkDate.setHours(0, 0, 0, 0)
    return checkDate <= cutoff
  }, [baseDate])

  function handleSetWeekMode() {
    setViewMode('week')
    if (!filterHall && !filterTrainer && activeHalls.length > 0) {
      setFilterHall(activeHalls[0].id)
    }
  }

  const navLabel = useMemo(() => {
    if (viewMode === 'day') {
      return formatDayFull(weekDays[0])
    }
    const start = weekDays[0]
    const end = weekDays[6]
    return `${formatDateShort(start)} – ${formatDate(end)}`
  }, [weekDays, viewMode])

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className={styles.layout}>
      <Sidebar />
      <BottomNav />
      <main className={styles.main}>

        {/* Topbar row 1 */}
        <div className={styles.topbar}>
          {/* Mobile nav — date + today icon + calendar icon */}
          <div className={styles.mobileTopNav}>
            <div className={styles.mobileDateText}>
              <span className={styles.mobileDayName}>{WEEKDAYS_FULL[dowMondayIndex(baseDate)].toLowerCase()}</span>
              <span className={styles.mobileDateVal}>{formatDate(baseDate)}</span>
            </div>
            <div className={styles.mobileNavIcons}>
              <button className={styles.todayIconBtn} onClick={() => setBaseDate(new Date())} aria-label="Сьогодні">
                <span className={styles.todayIconNum}>{today.getDate()}</span>
              </button>
              <button className={styles.navIconBtn} onClick={() => setShowMobileCal(true)} aria-label="Календар">
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="2" width="12" height="11" rx="1.5"/>
                  <path d="M1 6h12M4 1v2M10 1v2"/>
                </svg>
              </button>
            </div>
          </div>

          <div className={styles.topbarLeft}>
            <div className={styles.dateChip}>
              <span className={styles.dateChipDay}>{baseDate.getDate()}</span>
            </div>

            <div className={styles.titleBlock}>
              <div className={styles.titleRow}>
                <span className={styles.monthTitle}>{navLabel}</span>
              </div>
              {viewMode === 'day' && (
                <span className={styles.dayLabel}>{WEEKDAYS_FULL[dowMondayIndex(baseDate)].toLowerCase()}</span>
              )}
            </div>
          </div>

          <div className={styles.topbarRight}>
            <div className={styles.desktopNav}>
            <button className={styles.navBtn} onClick={goPrev} disabled={isPrevDisabled} aria-label="Назад">
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
            </div>
            <div className={styles.viewToggle}>
                <button className={`${styles.viewBtn} ${viewMode === 'day' ? styles.viewBtnActive : ''}`} onClick={() => setViewMode('day')}>
                  День
                </button>
                <button className={`${styles.viewBtn} ${styles.viewBtnWeek} ${viewMode === 'week' ? styles.viewBtnActive : ''}`} onClick={handleSetWeekMode}>
                  Тиждень
                </button>
              </div>
            <button className={`btn-primary ${styles.btnAddClass}`} onClick={() => { setPrefill(undefined); setShowModal(true) }}>
                + Заняття
              </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className={styles.filterBar}>
          <FilterSelect
            value={filterHall}
            onChange={setFilterHall}
            placeholder="Всі зали"
            options={[
              { value: '', label: 'Всі зали' },
              ...activeHalls.map(h => ({ value: h.id, label: h.name })),
            ]}
          />
          <FilterSelect
            value={filterTrainer}
            onChange={setFilterTrainer}
            placeholder="Всі тренери"
            options={[
              { value: '', label: 'Всі тренери' },
              ...(trainers as { id: string; name: string; is_active: boolean }[])
                .filter(t => t.is_active)
                .map(t => ({ value: t.id, label: t.name })),
            ]}
          />
        </div>


        {/* Content row — grid area + right panel */}
        <div className={styles.contentRow}>
          <div className={styles.gridArea}>
            {/* Schedule grid */}
            <div
              ref={gridCardRef}
              className={[
                styles.gridCard,
                slideDir === 'left'  ? styles.slideOutLeft  : '',
                slideDir === 'right' ? styles.slideOutRight : '',
              ].filter(Boolean).join(' ')}
            >
            <div className={styles.gridScrollWrap}>
            {/* Week day names — only in week mode */}
            {viewMode === 'week' && (
              <div className={styles.weekDayHeader} style={{ gridTemplateColumns: `48px repeat(${weekDays.length}, 1fr)` }}>
                <div />
                {weekDays.map((day, di) => {
                  const isToday = isSameDay(day, today)
                  return (
                    <div key={di} className={`${styles.weekDayLabel} ${isToday ? styles.weekDayToday : ''}`}>
                      {WEEKDAYS_SHORT[dowMondayIndex(day)]} {String(day.getDate()).padStart(2, '0')}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Week filter label */}
            {viewMode === 'week' && (filterHall || filterTrainer) && (
              <div className={styles.weekFilterLabel}>
                {filterHall
                  ? activeHalls.find(h => h.id === filterHall)?.name
                  : (trainers as { id: string; name: string }[]).find(t => t.id === filterTrainer)?.name}
              </div>
            )}

            {/* Day header */}
            <div className={styles.weekHeader} style={{ gridTemplateColumns: `48px ${viewMode === 'week' ? `repeat(${weekDays.length}, 1fr)` : '1fr'}` }}>
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
            <div className={styles.bodyGridWrapper} style={{ overflowX: viewMode === 'week' ? 'auto' : 'hidden' }} ref={wrapperRef}>
            <div className={styles.bodyGrid} style={{ gridTemplateColumns: `48px ${viewMode === 'week' ? `repeat(${weekDays.length}, 1fr)` : '1fr'}` }}>
              {/* Now line overlay — day view only */}
              {viewMode === 'day' && nowTop !== null && (
                <div className={styles.nowLineOverlay} style={{ top: `${nowTop}px` }}>
                  <span className={styles.nowLineTime}>
                    {(() => { const n = new Date(); return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}` })()}
                  </span>
                  <div className={styles.nowLineDot} />
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
                {HOURS.slice(1).map(h => (
                  <div key={h} className={styles.hourLine} style={{ top: `${(h - MIN_HOUR) * hourHeight}px` }} />
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day, di) => {
                const dayClasses = filteredClasses.filter(c => isSameDay(new Date(c.starts_at), day))

                const dayHallCols = hallColumns

                const showHallCols = dayHallCols.length > 0

                return (
                  <div key={di} className={styles.dayCol} style={{ height: `${(MAX_HOUR - MIN_HOUR) * hourHeight}px` }}>
                    {/* Now line — week mode, only in today's column */}
                    {viewMode === 'week' && isSameDay(day, today) && nowTop !== null && (
                      <div className={styles.nowLineOverlay} style={{ top: `${nowTop}px` }}>
                        <span className={styles.nowLineTime}>
                          {(() => { const n = new Date(); return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}` })()}
                        </span>
                        <div className={styles.nowLineDot} />
                        <div className={styles.nowLineLine} />
                      </div>
                    )}
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
                            onCardClick={id => setEditClassId(id)}
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
          </div>

          {/* Right panel — day view only */}
          {viewMode === 'day' && (
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
            />
          )}
        </div>

        {/* Mobile calendar bottom sheet */}
        {showMobileCal && (
          <div className={styles.mobileCalOverlay} onClick={() => setShowMobileCal(false)}>
            <div className={styles.mobileCalSheet} onClick={e => e.stopPropagation()}>
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
                onDateSelect={d => { setBaseDate(d); setShowMobileCal(false) }}
              />
            </div>
          </div>
        )}

        {/* FAB — mobile only, creates new class */}
        <button
          className={styles.fab}
          onClick={() => { setPrefill(undefined); setShowModal(true) }}
          aria-label="Нове заняття"
        >
          +
        </button>
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
