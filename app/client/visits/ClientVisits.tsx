'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import CabinetHeader from '@/components/CabinetHeader'
import { supabase } from '@/lib/supabase'
import {
  listMyUpcomingEnrollments,
  listMyPastEnrollments,
  listMyRunningBalances,
} from '@/lib/queries/client-cabinet-data'
import type { MyEnrollmentRow, MyPastEnrollmentRow } from '@/lib/queries/client-cabinet-data'
import { useListQuery } from '@/hooks/useListQuery'
import { useAsync } from '@/hooks/useAsync'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { ticketTypeShortLabel, enrollmentBadge, type EnrollmentBadgeTone } from '@/lib/badges'
import { fullWhen, pluralHours } from '@/lib/formatters'
import { MSG } from '@/lib/messages'
import { DOW_LABELS_SHORT, DOW_LABELS_FULL, MONTHS_UK_CAP, MONTHS_UK_GENITIVE } from '@/lib/dateUtils'
import { kyivParts } from '@/lib/cancellation'
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

// --- Day key helpers (київський день, як у /client/schedule) ---
type DayKey = string // 'YYYY-M-D'

function toDayKey(isoStr: string): DayKey {
  const { year, month, day } = kyivParts(new Date(isoStr))
  return `${year}-${month}-${day}`
}

/** dayKey для Date через ISO — той самий київський день, що й у занять. */
function dateKey(d: Date): DayKey {
  return toDayKey(d.toISOString())
}

/** «Понеділок, 5 червня» з ключа 'YYYY-M-D' (як заголовок дня в /client/schedule). */
function dayHeading(key: DayKey): string {
  const [y, m, dd] = key.split('-').map(Number)
  const local = new Date(y, m - 1, dd)
  return `${DOW_LABELS_FULL[local.getDay()]}, ${dd} ${MONTHS_UK_GENITIVE[m - 1]}`
}

/** Понеділок-початок тижня, що містить d, + 7 днів (Date, локальний час). */
function weekOf(d: Date): Date[] {
  const day = d.getDay()
  const daysBack = day === 0 ? 6 : day - 1
  const mon = new Date(d); mon.setDate(d.getDate() - daysBack); mon.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const r = new Date(mon); r.setDate(mon.getDate() + i); return r
  })
}

/**
 * Тижнева сітка дат пн–нд зі свайпом між тижнями — спільний патерн із /client/schedule
 * (адмінський MobileScheduleTimeline). `direction` задає, у який бік активні дні:
 *  - 'future' (Майбутні): минулі дні приглушені/неактивні, свайп уперед.
 *  - 'past'   (Історія):  майбутні дні приглушені/неактивні, свайп назад.
 */
function WeekStrip({ direction, selected, daysWithVisits, weekOffset, onWeekOffsetChange, onSelect }: {
  direction: 'future' | 'past'
  selected: DayKey
  daysWithVisits: Set<DayKey>
  /** Зсув тижня контрольований ззовні — щоб кнопка «Сьогодні» могла його скинути. */
  weekOffset: number
  onWeekOffsetChange: (n: number) => void
  onSelect: (k: DayKey) => void
}) {
  const now = useMemo(() => new Date(), [])
  const today = useMemo(() => dateKey(now), [now])
  const todayStart = useMemo(() => { const t = new Date(now); t.setHours(0, 0, 0, 0); return t }, [now])

  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const swipeRef = useRef<{ x: number; y: number; decided: boolean } | null>(null)

  const baseWeekStart = useMemo(() => weekOf(now)[0], [now])
  const anchorDate = useMemo(() => {
    const a = new Date(baseWeekStart); a.setDate(baseWeekStart.getDate() + weekOffset * 7); return a
  }, [baseWeekStart, weekOffset])
  const week = useMemo(() => weekOf(anchorDate), [anchorDate])
  const monthLabel = `${MONTHS_UK_CAP[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`

  // Майбутні: weekOffset >= 0 (поточний тиждень і вперед).
  // Історія:  weekOffset <= 0 (поточний тиждень і назад).
  const goPrevWeek = useCallback(() => {
    if (direction === 'future' && weekOffset <= 0) return
    setSlideDir('right'); onWeekOffsetChange(weekOffset - 1)
  }, [direction, weekOffset, onWeekOffsetChange])
  const goNextWeek = useCallback(() => {
    if (direction === 'past' && weekOffset >= 0) return
    setSlideDir('left'); onWeekOffsetChange(weekOffset + 1)
  }, [direction, weekOffset, onWeekOffsetChange])

  // Свайп ←/→ по стрічці тижня (порт логіки /client/schedule).
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
      if (dx < 0) goNextWeek(); else goPrevWeek()
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [goPrevWeek, goNextWeek])

  return (
    <div ref={stripRef} className={styles.bookStripWrap}>
      <div className={styles.bookDaysMonth}>{monthLabel}</div>
      <div
        key={weekOffset}
        className={[
          styles.bookDays,
          slideDir === 'left' ? styles.bookDaysSlideLeft : '',
          slideDir === 'right' ? styles.bookDaysSlideRight : '',
        ].filter(Boolean).join(' ')}
        onAnimationEnd={() => setSlideDir(null)}
      >
        {week.map((d) => {
          const key = dateKey(d)
          const isToday = key === today
          const isSelected = selected === key
          // Майбутні: минуле неактивне. Історія: майбутнє (без сьогодні) неактивне.
          const isInactive = direction === 'future'
            ? d.getTime() < todayStart.getTime()
            : d.getTime() > todayStart.getTime()
          const hasVisits = daysWithVisits.has(key)
          return (
            <button
              key={key}
              type="button"
              className={[
                styles.bookDay,
                isToday ? styles.bookDayToday : '',
                isSelected ? styles.bookDayOn : '',
                isInactive ? styles.bookDayPast : '',
              ].filter(Boolean).join(' ')}
              aria-pressed={isSelected}
              disabled={isInactive}
              onClick={() => onSelect(key)}
            >
              <span className={styles.bookDayDow}>{DOW_LABELS_SHORT[d.getDay()]}</span>
              <span className={styles.bookDayNum}>{d.getDate()}</span>
              <span className={hasVisits && !isInactive ? styles.bookDayDot : styles.bookDayDotEmpty} />
            </button>
          )
        })}
      </div>
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
  const [upcomingWeekOffset, setUpcomingWeekOffset] = useState(0)
  const [historyWeekOffset, setHistoryWeekOffset] = useState(0)
  const [pastShown, setPastShown] = useState(PAGE_SIZE)

  const { fromISO } = useMemo(() => ({
    fromISO: new Date().toISOString(),
  }), [])

  const { data: upcoming, error: upcomingError, refetch: refetchUpcoming } = useListQuery(
    () => listMyUpcomingEnrollments(supabase, clientId, fromISO),
    [clientId, fromISO],
    { refetchOnVisible: true, initialData: initialUpcoming }
  )

  const { data: past, total: pastFetchedTotal, error: pastError, refetch: refetchPast } = useListQuery(
    async () => {
      const { data, totalCount, error } = await listMyPastEnrollments(supabase, clientId)
      return { data, count: totalCount, error }
    },
    [clientId],
    { refetchOnVisible: true, initialData: initialPast }
  )
  const pastTotal = pastFetchedTotal || initialPastTotal

  const { data: balanceAfterById, refetch: refetchBalances } = useAsync(
    () => listMyRunningBalances(supabase, clientId, fromISO),
    [clientId, fromISO],
    { refetchOnVisible: true, initialData: initialBalanceAfter }
  )

  // Pull-to-refresh: тягне всі три джерела разом (той самий шлях, що й
  // refetchOnVisible). Чекаємо на завершення, щоб індикатор тримався до даних.
  const scrollRef = useRef<HTMLDivElement>(null)
  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchUpcoming(), refetchPast(), refetchBalances()])
  }, [refetchUpcoming, refetchPast, refetchBalances])
  const { pull, refreshing, releasing, progress, ready } = usePullToRefresh(scrollRef, handleRefresh)

  const typeLabel = (t: string) => typeLabels[t] || ticketTypeShortLabel(t)

  const upcomingSorted = useMemo(
    () => [...upcoming].sort((a, b) => new Date(a.classes!.starts_at).getTime() - new Date(b.classes!.starts_at).getTime()),
    [upcoming]
  )
  const pastSorted = useMemo(
    () => [...past].sort((a, b) => new Date(b.classes!.starts_at).getTime() - new Date(a.classes!.starts_at).getTime()),
    [past]
  )

  // Дні з візитами (для крапки-індикатора під числом у тижневій сітці).
  const upcomingDaysSet = useMemo(() => {
    const s = new Set<DayKey>()
    for (const e of upcomingSorted) if (e.classes) s.add(toDayKey(e.classes.starts_at))
    return s
  }, [upcomingSorted])
  const historyDaysSet = useMemo(() => {
    const s = new Set<DayKey>()
    for (const e of pastSorted) if (e.classes) s.add(toDayKey(e.classes.starts_at))
    return s
  }, [pastSorted])

  // Дефолтний вибраний день: найближчий майбутній / найсвіжіший минулий візит.
  const firstUpcomingDay = upcomingSorted[0]?.classes ? toDayKey(upcomingSorted[0].classes!.starts_at) : null
  const firstHistoryDay  = pastSorted[0]?.classes ? toDayKey(pastSorted[0].classes!.starts_at) : null

  const effectiveUpcomingDay = upcomingDaySel ?? firstUpcomingDay ?? toDayKey(new Date().toISOString())
  const effectiveHistoryDay  = historyDaySel  ?? firstHistoryDay  ?? toDayKey(new Date().toISOString())

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

  // «До запису» (у шапці): повернути активну вкладку до її дефолтного дня —
  // найближчого майбутнього (Майбутні) / найсвіжішого минулого (Історія) візиту —
  // і скинути зсув тижня після свайпу. Назва нейтральна, бо кнопка веде не на
  // «сьогодні», а на найближчий запис (на сьогодні занять може й не бути).
  const activeHasVisits = activeTab === 'upcoming'
    ? upcomingSorted.length > 0
    : pastSorted.length > 0
  const goToNearestVisit = useCallback(() => {
    if (activeTab === 'upcoming') { setUpcomingWeekOffset(0); setUpcomingDaySel(null) }
    else { setHistoryWeekOffset(0); setHistoryDaySel(null); setPastShown(PAGE_SIZE) }
  }, [activeTab])
  // Кнопка лише коли є що показати (порожній стан кнопки не потребує).
  const todayAction: ReactNode = activeHasVisits ? (
    <button type="button" className={styles.bookTodayBtn} onClick={goToNearestVisit}>
      До запису
    </button>
  ) : undefined

  const wrap = (content: ReactNode) => (
    <>
      <CabinetHeader title="Мої візити" backHref="/client" hideLogout action={todayAction} />
      <div ref={scrollRef} className={styles.scroll}>
        <div
          className={`${styles.ptrIndicator} ${releasing ? styles.ptrReleasing : ''}`}
          style={{ height: pull, opacity: pull > 0 ? 1 : 0 }}
          aria-hidden
        >
          <span
            className={`${styles.ptrSpinner} ${refreshing ? styles.ptrSpinning : ''} ${ready && !refreshing ? styles.ptrSpinnerReady : ''}`}
            style={{ '--ptr-progress': progress } as CSSProperties}
          />
        </div>
        {content}
      </div>
    </>
  )

  return wrap(
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
            <WeekStrip
              direction="future"
              selected={effectiveUpcomingDay}
              daysWithVisits={upcomingDaysSet}
              weekOffset={upcomingWeekOffset}
              onWeekOffsetChange={setUpcomingWeekOffset}
              onSelect={setUpcomingDaySel}
            />
            <div className={styles.bookDayHeading}>{dayHeading(effectiveUpcomingDay)}</div>
            <div className={styles.visitList}>
              {upcomingForDay.length === 0 && (
                <p className={styles.bookNoSessions}>Записів у цей день немає.</p>
              )}
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
            <WeekStrip
              direction="past"
              selected={effectiveHistoryDay}
              daysWithVisits={historyDaysSet}
              weekOffset={historyWeekOffset}
              onWeekOffsetChange={setHistoryWeekOffset}
              onSelect={k => { setHistoryDaySel(k); setPastShown(PAGE_SIZE) }}
            />
            <div className={styles.bookDayHeading}>{dayHeading(effectiveHistoryDay)}</div>
            <div className={styles.visitList}>
              {historyForDay.length === 0 && (
                <p className={styles.bookNoSessions}>Візитів у цей день немає.</p>
              )}
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

