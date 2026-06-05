'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  listMyUpcomingEnrollments,
  listMyPastEnrollments,
} from '@/lib/queries/client-cabinet-data'
import { useListQuery } from '@/hooks/useListQuery'
import { ticketTypeShortLabel, enrollmentStatusLabel, enrollmentStatusClass } from '@/lib/badges'
import { DOW_LABELS_FULL, MONTHS_UK_GENITIVE } from '@/lib/dateUtils'
import { MSG } from '@/lib/messages'
import styles from '../client.module.css'

function pluralHours(n: number): string {
  const abs = Math.abs(n)
  const m10 = abs % 10, m100 = abs % 100
  if (m10 === 1 && m100 !== 11) return 'година'
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'години'
  return 'годин'
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// «пʼятниця, 5 червня, 14:00 – 15:00» — повна дата + діапазон часу.
function fullWhen(startISO: string, durationMin: number): string {
  const start = new Date(startISO)
  const end = new Date(start.getTime() + durationMin * 60000)
  const dow = DOW_LABELS_FULL[start.getDay()]
  return `${dow}, ${start.getDate()} ${MONTHS_UK_GENITIVE[start.getMonth()]}, ${hhmm(start)} – ${hhmm(end)}`
}

// «Через 3 години 43 хвилини» / «Через 12 хвилин» / «Зараз».
function timeUntil(startISO: string, nowMs: number): string {
  const diffMs = new Date(startISO).getTime() - nowMs
  if (diffMs <= 0) return 'Зараз'
  const totalMin = Math.floor(diffMs / 60000)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const mins = totalMin % 60
  const plural = (n: number, one: string, few: string, many: string) => {
    const m10 = n % 10, m100 = n % 100
    if (m10 === 1 && m100 !== 11) return one
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
    return many
  }
  const parts: string[] = []
  if (days > 0) parts.push(`${days} ${plural(days, 'день', 'дні', 'днів')}`)
  if (hours > 0) parts.push(`${hours} ${plural(hours, 'годину', 'години', 'годин')}`)
  if (mins > 0 && days === 0) parts.push(`${mins} ${plural(mins, 'хвилину', 'хвилини', 'хвилин')}`)
  return parts.length ? `Через ${parts.join(' ')}` : 'Зараз'
}

// Колір бейджа минулого візиту за статусом — узгоджено з badge-* проекту
// (attended→зелений, cancelled→жовтий, noshow→червоний).
function pastTimerClass(status: string): string {
  if (status === 'attended') return styles.visitTimerAttended
  if (status === 'noshow') return styles.visitTimerNoshow
  if (status === 'cancelled') return styles.visitTimerCancelled
  return styles.visitTimerPast
}

type Props = {
  clientId: string
  typeLabels: Record<string, string>
  sessionBalances: { ticket_type: string; sessions_balance: number }[]
}

export default function ClientVisits({ clientId, typeLabels, sessionBalances }: Props) {
  const balanceByType = Object.fromEntries(sessionBalances.map(b => [b.ticket_type, b.sessions_balance]))
  const { fromISO, nowISO, nowMs } = useMemo(() => ({
    fromISO: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
    nowISO: new Date().toISOString(),
    nowMs: Date.now(),
  }), [])

  const { data: upcoming } = useListQuery(
    () => listMyUpcomingEnrollments(supabase, clientId, fromISO),
    [clientId, fromISO],
    { realtime: ['enrollments', 'classes'], refetchOnVisible: true }
  )

  const { data: past } = useListQuery(
    () => listMyPastEnrollments(supabase, clientId, nowISO),
    [clientId, nowISO],
    { realtime: ['enrollments', 'classes'] }
  )

  const typeLabel = (t: string) => typeLabels[t] || ticketTypeShortLabel(t)

  const upcomingSorted = useMemo(
    () => [...upcoming].sort(
      (a, b) => new Date(a.classes!.starts_at).getTime() - new Date(b.classes!.starts_at).getTime()
    ),
    [upcoming]
  )

  const pastSorted = useMemo(
    () => [...past].sort(
      (a, b) => new Date(b.classes!.starts_at).getTime() - new Date(a.classes!.starts_at).getTime()
    ),
    [past]
  )

  return (
    <>
      <div className={styles.sectionLabel}>Майбутні записи</div>
      {upcomingSorted.length === 0 ? (
        <p className={styles.empty}>{MSG.empty.futureEnrollments}.</p>
      ) : (
        <div className={styles.visitList}>
          {upcomingSorted.map(e => {
            const c = e.classes!
            const cost = e.hours_attended?.length ?? 1
            const currentBalance = balanceByType[c.ticket_type] ?? 0
            const balanceAfter = currentBalance - cost
            return (
              <Link key={e.id} href={`/client/visits/${e.id}`} className={styles.visitCard}>
                <div className={`${styles.visitTimer} ${c.is_cancelled ? styles.visitTimerClassCancelled : ''}`}>
                  {c.is_cancelled ? 'Заняття скасовано' : timeUntil(c.starts_at, nowMs)}
                </div>
                <div className={styles.visitWhen}>{fullWhen(c.starts_at, c.duration_min)}</div>
                <div className={styles.visitMeta}>
                  {c.title || typeLabel(c.ticket_type)}
                  {c.halls?.name ? ` · ${c.halls.name}` : ''}
                  {` · ${c.duration_min} хв`}
                </div>
                {c.trainers?.name ? (
                  <div className={styles.visitTrainer}>
                    <span className={styles.visitTrainerAvatar}>{c.trainers.name.trim()[0]?.toUpperCase() || '?'}</span>
                    <span className={styles.visitTrainerName}>{c.trainers.name}</span>
                    <span className={styles.visitTrainerRole}>Тренер</span>
                    <ChevronRight className={styles.visitChevron} size={16} />
                  </div>
                ) : (
                  <div className={styles.visitTrainer}>
                    <ChevronRight className={styles.visitChevron} size={16} />
                  </div>
                )}
                {e.status === 'waitlist' && (
                  <span className={enrollmentStatusClass('waitlist')}>{enrollmentStatusLabel('waitlist')}</span>
                )}
                {!c.is_cancelled && (
                  <div className={`${styles.visitTimer} ${styles.visitTimerBottom} ${balanceAfter <= 0 ? styles.visitTimerNoshow : styles.visitTimerPast}`}>
                    Стан абонемента після тренування: {balanceAfter} {pluralHours(balanceAfter)}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}

      <div className={styles.sectionLabel}>Попередні записи</div>
      {pastSorted.length === 0 ? (
        <p className={styles.empty}>{MSG.empty.pastEnrollments}.</p>
      ) : (
        <div className={styles.visitList}>
          {pastSorted.map(e => {
            const c = e.classes!
            return (
              <Link key={e.id} href={`/client/visits/${e.id}`} className={styles.visitCard}>
                <div className={`${styles.visitTimer} ${pastTimerClass(e.status)}`}>
                  {enrollmentStatusLabel(e.status)}
                </div>
                <div className={styles.visitWhen}>{fullWhen(c.starts_at, c.duration_min)}</div>
                <div className={styles.visitMeta}>
                  {c.title || typeLabel(c.ticket_type)}
                  {c.halls?.name ? ` · ${c.halls.name}` : ''}
                  {` · ${c.duration_min} хв`}
                </div>
                {c.trainers?.name ? (
                  <div className={styles.visitTrainer}>
                    <span className={styles.visitTrainerAvatar}>{c.trainers.name.trim()[0]?.toUpperCase() || '?'}</span>
                    <span className={styles.visitTrainerName}>{c.trainers.name}</span>
                    <span className={styles.visitTrainerRole}>Тренер</span>
                    <ChevronRight className={styles.visitChevron} size={16} />
                  </div>
                ) : (
                  <div className={styles.visitTrainer}>
                    <ChevronRight className={styles.visitChevron} size={16} />
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
