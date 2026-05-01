'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import ClassModal from '@/components/ClassModal'
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

                {/* Cards */}
                {!loading && dayClasses.map(cls => {
                  const activeCount = cls.enrollments.filter(
                    e => e.status === 'enrolled' || e.status === 'attended'
                  ).length
                  return (
                    <button
                      key={cls.id}
                      className={`${styles.card} ${cls.is_cancelled ? styles.cardCancelled : ''}`}
                      style={{
                        top: `${getCardTop(cls.starts_at)}px`,
                        height: `${getCardHeight(cls.duration_min)}px`,
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
                      <span className={styles.cardCount}>
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
