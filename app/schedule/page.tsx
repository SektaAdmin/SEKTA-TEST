'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import ClassModal from '@/components/features/ClassModal'
import type { Class } from '@/types'
import styles from './schedule.module.css'

const supabase = createClient()

const DAYS_UA = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
const MONTHS_UA = ['Січ', 'Лют', 'Бер', 'Квіт', 'Трав', 'Черв', 'Лип', 'Серп', 'Вер', 'Жовт', 'Лист', 'Груд']

const MIN_HOUR = 7
const MAX_HOUR = 23
const HOUR_HEIGHT = 80 // px per hour
const HOURS = Array.from({ length: MAX_HOUR - MIN_HOUR }, (_, i) => MIN_HOUR + i)

type ClassWithJoins = Class & {
  trainers: { name: string } | null
  halls: { name: string } | null
  enrollments: { id: string; status: string }[]
}

const TYPE_COLORS = [
  '#5b8af5', // blue
  '#c8f060', // lime (accent)
  '#f07850', // orange
  '#a06cf0', // purple
  '#50c8d8', // teal
  '#f0c840', // yellow
  '#e05080', // pink
  '#60d890', // green
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

function formatDayDate(d: Date) {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getCardTop(iso: string): number {
  const d = new Date(iso)
  return (d.getHours() - MIN_HOUR + d.getMinutes() / 60) * HOUR_HEIGHT
}

function getCardHeight(durationMin: number): number {
  return Math.max((durationMin / 60) * HOUR_HEIGHT, 52)
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

export default function SchedulePage() {
  const router = useRouter()
  const [baseDate, setBaseDate] = useState(() => new Date())
  const [classes, setClasses] = useState<ClassWithJoins[]>([])
  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [nowTop, setNowTop] = useState<number | null>(null)

  const { weekDays, weekStartISO, weekEndISO } = useMemo(() => {
    const days = getWeekDays(baseDate)
    const end = new Date(days[6])
    end.setHours(23, 59, 59, 999)
    return {
      weekDays: days,
      weekStartISO: days[0].toISOString(),
      weekEndISO: end.toISOString(),
    }
  }, [baseDate])

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const fetchClasses = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('classes')
      .select('*, trainers(name), halls(name), enrollments(id, status)')
      .gte('starts_at', weekStartISO)
      .lte('starts_at', weekEndISO)
      .order('starts_at')
    setClasses((data ?? []) as ClassWithJoins[])
    setLoading(false)
  }, [weekStartISO, weekEndISO])

  useEffect(() => { fetchClasses() }, [fetchClasses])

  useEffect(() => {
    supabase.from('training_types').select('code, label').then(({ data }) => {
      const map: Record<string, string> = {}
      for (const t of data ?? []) map[t.code] = t.label
      setTypeLabels(map)
    })
  }, [])

  useEffect(() => {
    function updateNow() {
      const now = new Date()
      const h = now.getHours() + now.getMinutes() / 60
      if (h >= MIN_HOUR && h < MAX_HOUR) {
        setNowTop((h - MIN_HOUR) * HOUR_HEIGHT)
      } else {
        setNowTop(null)
      }
    }
    updateNow()
    const id = setInterval(updateNow, 60000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.weekNav}>
            <button
              className={styles.navBtn}
              onClick={() => setBaseDate(d => { const n = new Date(d); n.setDate(d.getDate() - 7); return n })}
              aria-label="Попередній тиждень"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 2L4 7l5 5"/>
              </svg>
            </button>
            <span className={styles.weekRange}>{formatWeekRange(weekDays)}</span>
            <button
              className={styles.navBtn}
              onClick={() => setBaseDate(d => { const n = new Date(d); n.setDate(d.getDate() + 7); return n })}
              aria-label="Наступний тиждень"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 2l5 5-5 5"/>
              </svg>
            </button>
            <button
              className={styles.todayBtn}
              onClick={() => setBaseDate(new Date())}
              aria-label="Сьогодні"
            >
              Сьогодні
            </button>
          </div>
          <button className={styles.btnNew} onClick={() => setShowModal(true)}>
            + Заняття
          </button>
        </div>

        {/* Sticky week header */}
        <div className={styles.weekHeader}>
          <div className={styles.gutterCorner} />
          {weekDays.map((day, di) => {
            const isToday = isSameDay(day, today)
            return (
              <div key={di} className={`${styles.dayHeader} ${isToday ? styles.dayHeaderToday : ''}`}>
                <span className={styles.dayName}>{DAYS_UA[di]}</span>
                <span className={styles.dayDate}>{formatDayDate(day)}</span>
              </div>
            )
          })}
        </div>

        {/* Calendar body: time gutter + day columns */}
        <div className={styles.bodyGrid}>
          {/* Time gutter */}
          <div className={styles.timeGutter}>
            {HOURS.map(h => (
              <div key={h} className={styles.timeRow}>
                <span className={styles.timeLabel}>
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day, di) => {
            const dayClasses = classes.filter(c => isSameDay(new Date(c.starts_at), day))
            const lanes = computeLanes(dayClasses)
            return (
              <div key={di} className={styles.dayCol}>
                {/* Hour lines */}
                {HOURS.slice(1).map(h => (
                  <div
                    key={h}
                    className={styles.hourLine}
                    style={{ top: `${(h - MIN_HOUR) * HOUR_HEIGHT}px` }}
                  />
                ))}

                {/* Current time indicator */}
                {nowTop !== null && isSameDay(day, today) && (
                  <div className={styles.nowLine} style={{ top: `${nowTop}px` }} />
                )}

                {/* Cards */}
                {!loading && dayClasses.map(cls => {
                  const activeCount = cls.enrollments.filter(
                    e => e.status === 'enrolled' || e.status === 'attended'
                  ).length
                  const { laneIndex, laneCount } = lanes.get(cls.id) ?? { laneIndex: 0, laneCount: 1 }
                  return (
                    <button
                      key={cls.id}
                      className={`${styles.card} ${cls.is_cancelled ? styles.cardCancelled : ''}`}
                      style={{
                        top: `${getCardTop(cls.starts_at)}px`,
                        height: `${getCardHeight(cls.duration_min)}px`,
                        left: `calc(${(laneIndex / laneCount) * 100}% + 4px)`,
                        right: `calc(${((laneCount - laneIndex - 1) / laneCount) * 100}% + 4px)`,
                        ['--card-color' as string]: typeColor(cls.ticket_type),
                      }}
                      onClick={() => router.push(`/schedule/${cls.id}`)}
                    >
                      <span className={styles.cardTime}>{formatTime(cls.starts_at)}</span>
                      <span className={styles.cardType}>
                        {typeLabels[cls.ticket_type] ?? cls.ticket_type}
                        {cls.title ? ` · ${cls.title}` : ''}
                      </span>
                      {cls.trainers && (
                        <span className={styles.cardMeta}>{cls.trainers.name}</span>
                      )}
                      {cls.halls && (
                        <span className={styles.cardMeta}>{cls.halls.name}</span>
                      )}
                      <span className={`${styles.cardCount} ${cls.capacity != null && activeCount >= cls.capacity ? styles.cardCountFull : cls.capacity != null && activeCount >= cls.capacity * 0.8 ? styles.cardCountAlmost : ''}`}>
                        {activeCount}{cls.capacity != null ? `/${cls.capacity}` : ''} записані
                      </span>
                      {cls.is_cancelled && (
                        <span className={styles.cancelledBadge}>скасовано</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </main>

      {showModal && (
        <ClassModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchClasses() }}
        />
      )}
    </div>
  )
}
