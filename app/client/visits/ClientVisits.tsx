'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  listMyUpcomingEnrollments,
  listMyPastEnrollments,
  listMyRunningBalances,
} from '@/lib/queries/client-cabinet-data'
import type { MyEnrollmentRow, MyPastEnrollmentRow } from '@/lib/queries/client-cabinet-data'
import { useListQuery } from '@/hooks/useListQuery'
import { useAsync } from '@/hooks/useAsync'
import { ticketTypeShortLabel, enrollmentBadge, type EnrollmentBadgeTone } from '@/lib/badges'
import { fullWhen, pluralHours } from '@/lib/formatters'
import { MSG } from '@/lib/messages'
import styles from '../client.module.css'

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

// Tone із enrollmentBadge → локальний CSS-Module клас кабінету.
const VISIT_TONE_CLASS: Record<EnrollmentBadgeTone, string> = {
  attended:  styles.visitTimerAttended,
  noshow:    styles.visitTimerNoshow,
  late:      styles.visitTimerLatePenalty,
  cancelled: styles.visitTimerCancelled,
  enrolled:  styles.visitBadgeEnrolled,
  waitlist:  styles.visitBadgeWaitlist,
}

// Спільні шматки картки візиту (повторюються в «Майбутні» і «Історія»).
// Семантично однакові; різні картки (таймер/списання) лишаються своїми —
// зливати їх у єдиний <ClassCard> не варто (хибна абстракція).

function TrainerRow({ name, chevron }: { name: string | null | undefined; chevron?: boolean }) {
  // Без імені тренера, але з chevron — лишаємо порожній рядок-носій для стрілки.
  if (!name) {
    return chevron ? (
      <div className={styles.visitTrainerTop}>
        <ChevronRight className={styles.visitChevron} size={16} />
      </div>
    ) : null
  }
  return (
    <div className={styles.visitTrainerTop}>
      <span className={styles.visitTrainerAvatar}>{name.trim()[0]?.toUpperCase() || '?'}</span>
      <div>
        <div className={styles.visitTrainerName}>{name}</div>
        <div className={styles.visitTrainerRole}>Тренер</div>
      </div>
      {chevron && <ChevronRight className={styles.visitChevron} size={16} />}
    </div>
  )
}

function WhenMeta({ c, typeLabel }: {
  c: { starts_at: string; duration_min: number; title: string | null; ticket_type: string; halls: { name: string } | null }
  typeLabel: (t: string) => string
}) {
  return (
    <>
      <div className={styles.visitWhen}>{fullWhen(c.starts_at, c.duration_min)}</div>
      <div className={styles.visitMeta}>
        {c.title || typeLabel(c.ticket_type)}
        {c.halls?.name ? ` · ${c.halls.name}` : ''}
        {` · ${c.duration_min} хв`}
      </div>
    </>
  )
}

// Скільки карток показуємо до «показати ще». Майбутні: max нині 11, але запис
// розширюється на тижні наперед (постійники × N) → пагінуємо, щоб список не ріс.
const PAGE_SIZE = 8

type Props = {
  clientId: string
  typeLabels: Record<string, string>
  /** enrollment.id → залишок сесій після заняття (server-prefetch, RPC). */
  initialBalanceAfter: Record<string, number>
  initialUpcoming: MyEnrollmentRow[]
  initialPast: MyPastEnrollmentRow[]
}

export default function ClientVisits({
  clientId,
  typeLabels,
  initialBalanceAfter,
  initialUpcoming,
  initialPast,
}: Props) {
  const [upcomingShown, setUpcomingShown] = useState(PAGE_SIZE)
  const [pastShown, setPastShown] = useState(PAGE_SIZE)
  const { fromISO, nowMs } = useMemo(() => ({
    fromISO: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
    nowMs: Date.now(),
  }), [])

  // Дані прийшли зі сервера (initialData) — без realtime, без дубль-запиту при
  // монтуванні. Свіжість — через refetchOnVisible (повернення до екрана після
  // чату з адміном). Клієнт кабінету бачить лише свої дані, що змінює адмін.
  const { data: upcoming, error: upcomingError } = useListQuery(
    () => listMyUpcomingEnrollments(supabase, clientId, fromISO),
    [clientId, fromISO],
    { refetchOnVisible: true, initialData: initialUpcoming }
  )

  const { data: past, error: pastError } = useListQuery(
    () => listMyPastEnrollments(supabase, clientId),
    [clientId],
    { refetchOnVisible: true, initialData: initialPast }
  )

  const typeLabel = (t: string) => typeLabels[t] || ticketTypeShortLabel(t)

  const upcomingSorted = useMemo(
    () => [...upcoming].sort(
      (a, b) => new Date(a.classes!.starts_at).getTime() - new Date(b.classes!.starts_at).getTime()
    ),
    [upcoming]
  )

  // Залишок сесій ПІСЛЯ кожного майбутнього заняття (наростаюче, в хронології) —
  // серверний RPC get_session_balances_running. Рахує по ВСІХ майбутніх записах,
  // тож пагінація списку нижче не ламає кумулятив. enrollment.id → залишок після.
  const { data: balanceAfterById } = useAsync(
    () => listMyRunningBalances(supabase, clientId, fromISO),
    [clientId, fromISO],
    { refetchOnVisible: true, initialData: initialBalanceAfter }
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
      {upcomingError ? (
        <p className="badge-danger" style={{ padding: '10px 12px', borderRadius: 8 }}>
          Помилка завантаження. Спробуйте оновити сторінку.
        </p>
      ) : upcomingSorted.length === 0 ? (
        <p className={styles.empty}>{MSG.empty.futureEnrollments}.</p>
      ) : (
        <div className={styles.visitList}>
          {upcomingSorted.slice(0, upcomingShown).map(e => {
            const c = e.classes!
            const balanceAfter = balanceAfterById?.[e.id] ?? 0
            return (
              <Link key={e.id} href={`/client/visits/${e.id}`} prefetch className={styles.visitCard}>
                <div className={`${styles.visitTimer} ${c.is_cancelled ? styles.visitTimerClassCancelled : ''}`}>
                  {c.is_cancelled ? 'Заняття скасовано' : timeUntil(c.starts_at, nowMs)}
                </div>
                <TrainerRow name={c.trainers?.name} chevron />
                <WhenMeta c={c} typeLabel={typeLabel} />
                <div className={styles.visitHistoryFooter}>
                  <div className={styles.visitHistoryRow}>
                    <span className={styles.visitHistoryLabel}>Статус</span>
                    {(() => {
                      const badge = enrollmentBadge(e, 'client')
                      return (
                        <span className={`${styles.visitHistoryBadge} ${VISIT_TONE_CLASS[badge.tone]}`}>
                          {badge.label}
                        </span>
                      )
                    })()}
                  </div>
                  {!c.is_cancelled && (
                    <div className={styles.visitHistoryRow}>
                      <span className={styles.visitHistoryLabel}>Після тренування</span>
                      <span className={`${styles.visitHistoryBadge} ${balanceAfter > 0 ? styles.visitBadgeBalancePositive : balanceAfter === 0 ? styles.visitBadgeBalanceZero : styles.visitBadgeBalanceNegative}`}>
                        {balanceAfter} {pluralHours(balanceAfter)}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
          {upcomingShown < upcomingSorted.length && (
            <button type="button" className={styles.showMore} onClick={() => setUpcomingShown(n => n + PAGE_SIZE)}>
              Показати ще
            </button>
          )}
        </div>
      )}

      <div className={styles.sectionLabel}>Історія</div>
      {pastError ? (
        <p className="badge-danger" style={{ padding: '10px 12px', borderRadius: 8 }}>
          Помилка завантаження. Спробуйте оновити сторінку.
        </p>
      ) : pastSorted.length === 0 ? (
        <p className={styles.empty}>{MSG.empty.pastEnrollments}.</p>
      ) : (
        <div className={styles.visitList}>
          {pastSorted.slice(0, pastShown).map(e => {
            const c = e.classes!
            const sessionsUsed = e.sessions_used ?? 0
            const badge = enrollmentBadge(e, 'client')
            return (
              <div key={e.id} className={styles.visitCardStatic}>
                <TrainerRow name={c.trainers?.name} />
                <WhenMeta c={c} typeLabel={typeLabel} />
                <div className={styles.visitHistoryFooter}>
                  <div className={styles.visitHistoryRow}>
                    <span className={styles.visitHistoryLabel}>Статус</span>
                    <span className={`${styles.visitHistoryBadge} ${VISIT_TONE_CLASS[badge.tone]}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className={styles.visitHistoryRow}>
                    <span className={styles.visitHistoryLabel}>Списання</span>
                    <span className={styles.visitHistoryValue}>
                      {sessionsUsed > 0 ? `${sessionsUsed} заняття` : 'Не списано'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
          {pastShown < pastSorted.length && (
            <button type="button" className={styles.showMore} onClick={() => setPastShown(n => n + PAGE_SIZE)}>
              Показати ще
            </button>
          )}
        </div>
      )}
    </>
  )
}
