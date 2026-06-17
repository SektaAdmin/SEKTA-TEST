'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ClassDetailModal from '@/components/ClassDetailModal'
import ClassModal from '@/components/ClassModal'
import { typeColor } from '@/lib/typeColor'
import { getActiveCount } from '@/lib/scheduleMetrics'
import {
  WEEKDAYS_SHORT,
  MONTHS_UK_CAP,
  dowMondayIndex,
} from '@/lib/dateUtils'
import type { TrainerClassRow } from '@/lib/queries/trainer-cabinet'
import styles from './my.module.css'

const MIN_HOUR = 8
const MAX_HOUR = 22
const HOUR_HEIGHT = 64
const HOURS = Array.from({ length: MAX_HOUR - MIN_HOUR }, (_, i) => MIN_HOUR + i)

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function startOfDay(d: Date) {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r
}

function hhmm(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function endTime(iso: string, durationMin: number) {
  const d = new Date(new Date(iso).getTime() + durationMin * 60000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const TIMELINE_PAD_TOP = 10

function cardTop(iso: string): number {
  const d = new Date(iso)
  return TIMELINE_PAD_TOP + (d.getHours() - MIN_HOUR + d.getMinutes() / 60) * HOUR_HEIGHT
}

function cardHeight(durationMin: number): number {
  return Math.max((durationMin / 60) * HOUR_HEIGHT, 44)
}

// Тиждень (7 днів) починаючи з понеділка, що містить дату d
function weekOf(d: Date): Date[] {
  const day = d.getDay()
  const daysBack = day === 0 ? 6 : day - 1
  const mon = new Date(d)
  mon.setDate(d.getDate() - daysBack)
  mon.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const r = new Date(mon); r.setDate(mon.getDate() + i); return r
  })
}

type EnrollmentWithClient = {
  id: string
  status: string
  clients: { first_name: string | null; last_name: string | null } | null
}

type ClassRow = TrainerClassRow & { enrollments: EnrollmentWithClient[] }

const INDIVIDUAL_TYPES = ['individual', 'individualduo', 'individualtrio']

function getCardLabel(cls: ClassRow): string {
  if (cls.title) return cls.title
  if (INDIVIDUAL_TYPES.includes(cls.ticket_type)) {
    const active = (cls.enrollments ?? []).filter(
      e => e.status === 'enrolled' || e.status === 'attended' || e.status === 'waitlist'
    )
    if (active.length > 0) {
      return active
        .map(e => {
          const c = e.clients
          if (!c) return ''
          return [c.first_name, c.last_name].filter(Boolean).join(' ')
        })
        .filter(Boolean)
        .join(', ') || cls.ticket_type
    }
  }
  return cls.ticket_type
}

interface WeekStripProps {
  selectedDate: Date
  onSelect: (d: Date) => void
  today: Date
  slideDir: 'left' | 'right' | null
  weekKey: number
}

function WeekStrip({ selectedDate, onSelect, today, slideDir, weekKey }: WeekStripProps) {
  const week = weekOf(selectedDate)
  const monthLabel = MONTHS_UK_CAP[selectedDate.getMonth()] + ' ' + selectedDate.getFullYear()

  const animClass = slideDir === 'left'
    ? styles.slideLeft
    : slideDir === 'right'
      ? styles.slideRight
      : ''

  return (
    <div className={styles.weekStrip}>
      <div className={styles.weekMonth}>{monthLabel}</div>
      <div
        key={weekKey}
        className={[styles.weekDays, animClass].filter(Boolean).join(' ')}
      >
        {week.map((day, i) => {
          const isToday = isSameDay(day, today)
          const isSelected = isSameDay(day, selectedDate)
          return (
            <button
              key={i}
              className={[
                styles.weekDay,
                isToday ? styles.weekDayToday : '',
                isSelected ? styles.weekDaySelected : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelect(day)}
            >
              <span className={styles.weekDayLabel}>{WEEKDAYS_SHORT[dowMondayIndex(day)]}</span>
              <span className={styles.weekDayNum}>{day.getDate()}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface TimelineProps {
  classes: ClassRow[]
  selectedDate: Date
  onClassClick: (id: string) => void
  nowTop: number | null
}

function Timeline({ classes, selectedDate, onClassClick, nowTop }: TimelineProps) {
  const dayClasses = classes
    .filter(c => isSameDay(new Date(c.starts_at), selectedDate))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())

  return (
    <div className={styles.timeline}>
      {/* Рядки годин */}
      {HOURS.map(h => (
        <div key={h} className={styles.hourRow} style={{ top: TIMELINE_PAD_TOP + (h - MIN_HOUR) * HOUR_HEIGHT }}>
          <span className={styles.hourLabel}>{String(h).padStart(2, '0')}:00</span>
          <div className={styles.hourLine} />
        </div>
      ))}

      {/* Лінія «зараз» */}
      {nowTop !== null && isSameDay(selectedDate, new Date()) && (
        <div className={styles.nowLine} style={{ top: nowTop }}>
          <div className={styles.nowDot} />
          <div className={styles.nowLineLine} />
        </div>
      )}

      {/* Картки занять */}
      {dayClasses.map(cls => {
        const color = typeColor(cls.ticket_type)
        const active = getActiveCount((cls.enrollments ?? []) as { status: string }[])
        const top = cardTop(cls.starts_at)
        const height = cardHeight(cls.duration_min)
        const timeStr = `${hhmm(cls.starts_at)} – ${endTime(cls.starts_at, cls.duration_min)}`
        const label = getCardLabel(cls)
        const compact = height < 56

        return (
          <button
            key={cls.id}
            className={[styles.card, cls.is_cancelled ? styles.cardCancelled : ''].filter(Boolean).join(' ')}
            style={{
              top,
              height,
              ['--card-color' as string]: color,
            }}
            onClick={() => onClassClick(cls.id)}
          >
            <div className={styles.cardBorder} />
            <div className={styles.cardBody}>
              {compact ? (
                <span className={styles.cardCompact}>
                  <span className={styles.cardTitle}>{label}</span>
                  <span className={styles.cardTimeline}>{timeStr}</span>
                </span>
              ) : (
                <>
                  <div className={styles.cardTitle}>{label}</div>
                  <div className={styles.cardMeta}>
                    {timeStr}
                    {cls.halls?.name ? ` · ${cls.halls.name}` : ''}
                  </div>
                  {cls.capacity != null && !cls.is_cancelled && (
                    <div className={styles.cardCount}>
                      {active}/{cls.capacity} учасників
                    </div>
                  )}
                  {cls.choreo_stage && (
                    <div className={styles.cardChoreo}>{cls.choreo_stage}</div>
                  )}
                </>
              )}
            </div>
            {cls.is_cancelled && (
              <span className={styles.cardCancelledBadge}>Скасовано</span>
            )}
          </button>
        )
      })}

      {dayClasses.length === 0 && (
        <div className={styles.emptyDay}>Занять немає</div>
      )}
    </div>
  )
}

// ── Головний компонент ────────────────────────────────────────────────────────

type Props = {
  upcoming: TrainerClassRow[]
  past: TrainerClassRow[]
  trainerId: string
}

export default function TrainerMyClasses({ upcoming, past, trainerId }: Props) {
  const router = useRouter()
  const today = useRef(startOfDay(new Date())).current
  const [selectedDate, setSelectedDate] = useState(today)
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null)
  const [weekKey, setWeekKey] = useState(0)
  const [nowTop, setNowTop] = useState<number | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [showClassModal, setShowClassModal] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)

  // Об'єднуємо upcoming + past у один масив
  const classes = [...upcoming, ...past] as ClassRow[]

  // Лінія «зараз»
  useEffect(() => {
    function update() {
      const now = new Date()
      const h = now.getHours() + now.getMinutes() / 60
      setNowTop(h >= MIN_HOUR && h < MAX_HOUR ? TIMELINE_PAD_TOP + (h - MIN_HOUR) * HOUR_HEIGHT : null)
    }
    update()
    const id = setInterval(update, 60000)
    return () => clearInterval(id)
  }, [])

  // Scroll до поточного часу при першому рендері
  useEffect(() => {
    if (nowTop !== null && timelineRef.current) {
      const scrollTo = Math.max(0, nowTop - 80)
      timelineRef.current.parentElement?.scrollTo({ top: scrollTo, behavior: 'smooth' })
    }
  }, [nowTop])

  const handleDateSelect = useCallback((d: Date) => {
    setSelectedDate(d)
  }, [])

  const handlePrevWeek = () => {
    setSlideDir('right')
    setWeekKey(k => k - 1)
    setSelectedDate(d => {
      const n = new Date(d); n.setDate(d.getDate() - 7); return n
    })
  }

  const handleNextWeek = () => {
    setSlideDir('left')
    setWeekKey(k => k + 1)
    setSelectedDate(d => {
      const n = new Date(d); n.setDate(d.getDate() + 7); return n
    })
  }

  // Свайп по тижнях
  const swipeRef = useRef<{ x: number; y: number; decided: boolean } | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    function onStart(e: TouchEvent) {
      swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, decided: false }
    }
    function onMove(e: TouchEvent) {
      const s = swipeRef.current; if (!s) return
      const dx = e.touches[0].clientX - s.x
      const dy = e.touches[0].clientY - s.y
      if (!s.decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        s.decided = true
        if (Math.abs(dx) <= Math.abs(dy)) { swipeRef.current = null; return }
      }
      e.preventDefault()
    }
    function onEnd(e: TouchEvent) {
      const s = swipeRef.current; swipeRef.current = null; if (!s || !s.decided) return
      const dx = e.changedTouches[0].clientX - s.x
      if (Math.abs(dx) < 40) return
      if (dx < 0) handleNextWeek(); else handlePrevWeek()
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [])

  return (
    <div className={styles.shell}>
      {/* Topbar */}
      <div className={styles.topbar}>
        <button className={styles.backBtn} onClick={() => router.push('/trainer')} aria-label="Меню">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 2L4 7l5 5"/>
          </svg>
          <span>Меню</span>
        </button>
        <span className={styles.topbarTitle}>Мої заняття</span>
        <button className={styles.todayBtn} onClick={() => setSelectedDate(today)}>
          Сьогодні
        </button>
        <button
          className={styles.addBtn}
          onClick={() => setShowClassModal(true)}
          aria-label="Додати заняття"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="9" y1="3" x2="9" y2="15"/>
            <line x1="3" y1="9" x2="15" y2="9"/>
          </svg>
        </button>
      </div>

      {/* Тижнева смужка зі свайпом */}
      <div ref={stripRef}>
        <WeekStrip
          selectedDate={selectedDate}
          onSelect={handleDateSelect}
          today={today}
          slideDir={slideDir}
          weekKey={weekKey}
        />
      </div>

      {/* Таймлайн */}
      <div className={styles.scroll} ref={timelineRef}>
        <Timeline
          classes={classes}
          selectedDate={selectedDate}
          onClassClick={setDetailId}
          nowTop={nowTop}
        />
      </div>

      {detailId && (
        <ClassDetailModal
          classId={detailId}
          onClose={() => setDetailId(null)}
          onClassUpdated={() => setDetailId(null)}
          viewerTrainerId={trainerId}
          isStaff={false}
        />
      )}

      {showClassModal && (
        <ClassModal
          onClose={() => setShowClassModal(false)}
          onSaved={() => { setShowClassModal(false); router.refresh() }}
          forcedTrainerId={trainerId}
          prefill={{ starts_at: selectedDate.toISOString() }}
        />
      )}
    </div>
  )
}
