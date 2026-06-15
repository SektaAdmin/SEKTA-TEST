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
import { DOW_LABELS_SHORT, MONTHS_UK_SHORT } from '@/lib/dateUtils'
import styles from '../client.module.css'

const VISIT_TONE_CLASS: Record<EnrollmentBadgeTone, string> = {
  attended:  styles.visitTimerAttended,
  noshow:    styles.visitTimerNoshow,
  late:      styles.visitTimerLatePenalty,
  cancelled: styles.visitTimerCancelled,
  enrolled:  styles.visitBadgeEnrolled,
  waitlist:  styles.visitBadgeWaitlist,
}

function TrainerRow({ name, chevron }: { name: string | null | undefined; chevron?: boolean }) {
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

// --- Day chip helpers ---
type DayKey = string // 'YYYY-M-D'

function toDayKey(isoStr: string): DayKey {
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type DayMeta = { key: DayKey; dow: number; day: number; month: number }

function buildDayMetas<T extends { classes: { starts_at: string } | null }>(
  items: T[],
  descending = false
): DayMeta[] {
  const seen = new Set<DayKey>()
  const arr: DayMeta[] = []
  for (const item of items) {
    const iso = item.classes?.starts_at
    if (!iso) continue
    const k = toDayKey(iso)
    if (seen.has(k)) continue
    seen.add(k)
    const d = new Date(iso)
    arr.push({ key: k, dow: d.getDay(), day: d.getDate(), month: d.getMonth() + 1 })
  }
  arr.sort((a, b) => {
    const cmp = a.key.localeCompare(b.key)
    return descending ? -cmp : cmp
  })
  return arr
}

function DayChips({ days, selected, onSelect }: {
  days: DayMeta[]
  selected: DayKey | null
  onSelect: (k: DayKey) => void
}) {
  return (
    <div className={styles.bookDays}>
      {days.map((d, i) => {
        const showMonth = i === 0 || d.month !== days[i - 1].month
        const isOn = selected === d.key
        return (
          <button
            key={d.key}
            type="button"
            className={`${styles.bookDay} ${isOn ? styles.bookDayOn : ''}`}
            aria-pressed={isOn}
            onClick={() => onSelect(d.key)}
          >
            <span className={styles.bookDayDow}>{DOW_LABELS_SHORT[d.dow]}</span>
            <span className={styles.bookDayNum}>{d.day}</span>
            <span className={styles.bookDayMonth}>{showMonth ? MONTHS_UK_SHORT[d.month - 1] : ''}</span>
          </button>
        )
      })}
    </div>
  )
}

const PAGE_SIZE = 8

type Props = {
  clientId: string
  typeLabels: Record<string, string>
  initialBalanceAfter: Record<string, number>
  initialUpcoming: MyEnrollmentRow[]
  initialPast: MyPastEnrollmentRow[]
  initialPastTotal: number
}

export default function ClientVisits({
  clientId,
  typeLabels,
  initialBalanceAfter,
  initialUpcoming,
  initialPast,
  initialPastTotal,
}: Props) {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming')
  const [upcomingDaySel, setUpcomingDaySel] = useState<DayKey | null>(null)
  const [historyDaySel, setHistoryDaySel] = useState<DayKey | null>(null)
  const [pastShown, setPastShown] = useState(PAGE_SIZE)

  const { fromISO } = useMemo(() => ({
    fromISO: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
  }), [])

  const { data: upcoming, error: upcomingError } = useListQuery(
    () => listMyUpcomingEnrollments(supabase, clientId, fromISO),
    [clientId, fromISO],
    { refetchOnVisible: true, initialData: initialUpcoming }
  )

  const { data: past, total: pastFetchedTotal, error: pastError } = useListQuery(
    async () => {
      const { data, totalCount, error } = await listMyPastEnrollments(supabase, clientId)
      return { data, count: totalCount, error }
    },
    [clientId],
    { refetchOnVisible: true, initialData: initialPast }
  )
  const pastTotal = pastFetchedTotal || initialPastTotal

  const { data: balanceAfterById } = useAsync(
    () => listMyRunningBalances(supabase, clientId, fromISO),
    [clientId, fromISO],
    { refetchOnVisible: true, initialData: initialBalanceAfter }
  )

  const typeLabel = (t: string) => typeLabels[t] || ticketTypeShortLabel(t)

  const upcomingSorted = useMemo(
    () => [...upcoming].sort((a, b) => new Date(a.classes!.starts_at).getTime() - new Date(b.classes!.starts_at).getTime()),
    [upcoming]
  )
  const pastSorted = useMemo(
    () => [...past].sort((a, b) => new Date(b.classes!.starts_at).getTime() - new Date(a.classes!.starts_at).getTime()),
    [past]
  )

  const upcomingDays = useMemo(() => buildDayMetas(upcomingSorted, false), [upcomingSorted])
  const historyDays  = useMemo(() => buildDayMetas(pastSorted, true),  [pastSorted])

  const effectiveUpcomingDay = upcomingDaySel ?? upcomingDays[0]?.key ?? null
  const effectiveHistoryDay  = historyDaySel  ?? historyDays[0]?.key  ?? null

  const upcomingForDay = useMemo(
    () => upcomingSorted.filter(e => e.classes && toDayKey(e.classes.starts_at) === effectiveUpcomingDay),
    [upcomingSorted, effectiveUpcomingDay]
  )
  const historyForDay = useMemo(
    () => pastSorted.filter(e => e.classes && toDayKey(e.classes.starts_at) === effectiveHistoryDay),
    [pastSorted, effectiveHistoryDay]
  )

  const bothEmpty = upcomingSorted.length === 0 && pastSorted.length === 0

  const errorBanner = (
    <p className="badge-danger" style={{ padding: '10px 12px', borderRadius: 8 }}>
      Помилка завантаження. Спробуйте оновити сторінку.
    </p>
  )

  return (
    <>
      {/* Tabs */}
      <div className={styles.visitTabs}>
        <button
          type="button"
          className={`${styles.visitTab} ${activeTab === 'upcoming' ? styles.visitTabOn : ''}`}
          onClick={() => setActiveTab('upcoming')}
        >
          Майбутні записи
        </button>
        <button
          type="button"
          className={`${styles.visitTab} ${activeTab === 'history' ? styles.visitTabOn : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Історія
        </button>
      </div>

      {/* ── UPCOMING ── */}
      {activeTab === 'upcoming' && (
        upcomingError ? errorBanner
        : bothEmpty ? (
          <div className={styles.visitEmptyState}>
            <p className={styles.visitEmptyTitle}>Запишіться на перше заняття</p>
            <p className={styles.visitEmptySubtitle}>Оберіть зручний час і тренера</p>
            <Link href="/client/schedule" className={styles.visitEmptyBtn}>Записатись</Link>
          </div>
        ) : upcomingSorted.length === 0 ? (
          <div className={styles.visitEmptyState}>
            <p className={styles.visitEmptyTitle}>{MSG.empty.futureEnrollments}</p>
            <Link href="/client/schedule" className={styles.visitEmptyBtn}>Записатись</Link>
          </div>
        ) : (
          <>
            <DayChips days={upcomingDays} selected={effectiveUpcomingDay} onSelect={setUpcomingDaySel} />
            <div className={styles.visitList}>
              {upcomingForDay.map(e => {
                const c = e.classes!
                const balanceAfter = balanceAfterById?.[e.id] ?? 0
                const badge = enrollmentBadge(e, 'client')
                return (
                  <Link key={e.id} href={`/client/visits/${e.id}`} prefetch className={styles.visitCard}>
                    <TrainerRow name={c.trainers?.name} chevron />
                    <WhenMeta c={c} typeLabel={typeLabel} />
                    <div className={styles.visitHistoryFooter}>
                      <div className={styles.visitHistoryRow}>
                        <span className={styles.visitHistoryLabel}>Статус</span>
                        <span className={`${styles.visitHistoryBadge} ${VISIT_TONE_CLASS[badge.tone]}`}>
                          {badge.label}
                        </span>
                      </div>
                      {!c.is_cancelled && (
                        <div className={styles.visitHistoryRow}>
                          <span className={styles.visitHistoryLabel}>Залишок після</span>
                          <span className={`${styles.visitHistoryBadge} ${
                            balanceAfter > 0 ? styles.visitBadgeBalancePositive
                            : balanceAfter === 0 ? styles.visitBadgeBalanceZero
                            : styles.visitBadgeBalanceNegative
                          }`}>
                            {balanceAfter} {pluralHours(balanceAfter)}
                          </span>
                        </div>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )
      )}

      {/* ── HISTORY ── */}
      {activeTab === 'history' && (
        pastError ? errorBanner
        : pastSorted.length === 0 ? (
          <div className={styles.visitEmptyState}>
            <p className={styles.visitEmptyTitle}>Ще немає відвіданих занять</p>
            <p className={styles.visitEmptySubtitle}>Тут зʼявляться ваші минулі візити</p>
          </div>
        ) : (
          <>
            <DayChips
              days={historyDays}
              selected={effectiveHistoryDay}
              onSelect={k => { setHistoryDaySel(k); setPastShown(PAGE_SIZE) }}
            />
            <div className={styles.visitList}>
              {historyForDay.slice(0, pastShown).map(e => {
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
                          {sessionsUsed > 0 ? `${sessionsUsed} ${pluralHours(sessionsUsed)}` : 'Не списано'}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
              {pastShown < historyForDay.length && (
                <button type="button" className={styles.showMore} onClick={() => setPastShown(n => n + PAGE_SIZE)}>
                  Показати ще
                </button>
              )}
            </div>
            {/* Не показуємо «Показано N з M» — limit(50) в запиті робить лічильник нерепрезентативним */}
          </>
        )
      )}
    </>
  )
}
