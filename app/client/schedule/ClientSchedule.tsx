'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { listBookableClasses, listMySessionBalances, getClassAvailability } from '@/lib/queries/client-cabinet-data'
import type { BookableClassRow, ClassAvailability } from '@/lib/queries/client-cabinet-data'
import { clientEnroll } from '@/lib/queries/client-cabinet'
import { useListQuery } from '@/hooks/useListQuery'
import { useAsync } from '@/hooks/useAsync'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { ticketTypeShortLabel, ticketTypeNominativeLabel, enrollmentStatusLabel } from '@/lib/badges'
import { hhmm, fullWhen, pluralHours } from '@/lib/formatters'
import { DOW_LABELS_SHORT, DOW_LABELS_FULL, MONTHS_UK_SHORT, MONTHS_UK_GENITIVE, MONTHS_UK_CAP } from '@/lib/dateUtils'
import { goesToWaitlist } from '@/lib/scheduleMetrics'
import { kyivParts } from '@/lib/cancellation'
import CabinetHeader from '@/components/CabinetHeader'
import { ModalShell } from '@/components/ui/ModalShell'
import { ModalFooter } from '@/components/ui/ModalFooter'
import { MSG } from '@/lib/messages'
import styles from '../client.module.css'

const ENROLL_ERROR_LABEL: Record<string, string> = {
  no_sessions: 'Немає оплачених занять цього типу',
  conflict: 'У вас уже є запис на цей час',
  duplicate: 'Ви вже записані на це заняття',
  'Заняття вже почалось': 'Заняття вже розпочалось',
  'Заняття скасовано': 'Заняття скасовано',
}

function dayKey(startISO: string): string {
  const k = kyivParts(new Date(startISO))
  return `${k.year}-${k.month}-${k.day}`
}

function todayKey(): string {
  return dayKey(new Date().toISOString())
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

/** dayKey для Date (через ISO, той самий київський день що й у занять). */
function dateKey(d: Date): string {
  return dayKey(d.toISOString())
}

function dayHeading(key: string, dp: { dow: number; day: number; month: number }): string {
  return `${DOW_LABELS_FULL[dp.dow]}, ${dp.day} ${MONTHS_UK_GENITIVE[dp.month - 1]}`
}

function sessionCost(durationMin: number): number {
  return durationMin >= 120 ? 2 : 1
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0]?.[0] ?? '?').toUpperCase()
}

type EnrolledState = 'enrolled' | 'waitlist'
type TrainerOption = { id: string; name: string }
type DayGroup = { key: string; dow: number; day: number; month: number; year: number }

type Props = {
  clientId: string
  fromISO: string
  toISO: string
  typeLabels: Record<string, string>
  initialBalanceByType: Record<string, number>
  availability: Record<string, ClassAvailability>
  initialEnrolled: Record<string, EnrolledState>
  initialClasses: BookableClassRow[]
}

export default function ClientSchedule({
  clientId,
  fromISO,
  toISO,
  typeLabels,
  initialBalanceByType,
  availability,
  initialEnrolled,
  initialClasses,
}: Props) {
  const [enrolled, setEnrolled] = useState<Record<string, EnrolledState>>(initialEnrolled)
  const [enrolling, setEnrolling] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<BookableClassRow | null>(null)
  const [trainerFilter, setTrainerFilter] = useState<string | null>(null)

  const { data: liveBalance, refetch: refetchBalance } = useAsync(
    async () => {
      const { data, error } = await listMySessionBalances(supabase, clientId)
      if (error) return { data: initialBalanceByType, error }
      return {
        data: Object.fromEntries(data.map(b => [b.ticket_type, b.sessions_balance])) as Record<string, number>,
        error: null,
      }
    },
    [clientId],
    { refetchOnVisible: true, initialData: initialBalanceByType }
  )
  const balanceByType = liveBalance ?? initialBalanceByType

  const { data: classes, loading, error: classesError, refetch: refetchClasses } = useListQuery(
    () => listBookableClasses(supabase, fromISO, toISO),
    [fromISO, toISO],
    { refetchOnVisible: true, initialData: initialClasses }
  )

  // Stable dep string: changes only when actual class IDs change (after a refetch
  // that added or removed classes), which in turn triggers availability refresh.
  const classIdStr = useMemo(
    () => classes.map(c => c.id).sort().join(','),
    [classes]
  )

  const { data: currentAvailability, refetch: refetchAvailability } = useAsync(
    async () => {
      const ids = classes.map(c => c.id)
      if (!ids.length) return { data: availability, error: null }
      return getClassAvailability(supabase, ids)
    },
    [classIdStr],
    { refetchOnVisible: true, initialData: availability }
  )
  const avMap = currentAvailability ?? availability

  // Pull-to-refresh: оновлює класи+доступність+баланс разом. Жест активний лише
  // від верху .scroll і лише коли вертикаль домінує — горизонтальний свайп тижня
  // (stripRef) не зачіпається.
  const scrollRef = useRef<HTMLDivElement>(null)
  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchClasses(), refetchAvailability(), refetchBalance()])
  }, [refetchClasses, refetchAvailability, refetchBalance])
  const { pull, refreshing, releasing } = usePullToRefresh(scrollRef, handleRefresh)

  const typeLabel = (t: string) => typeLabels[t] || ticketTypeShortLabel(t)
  const serviceName = (t: string) => ticketTypeNominativeLabel(t) || typeLabel(t)

  // Оптимістичний захист: кожен активний запис у вікні = зайнята сесія.
  const reservedByType = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of classes) {
      if (enrolled[c.id]) m[c.ticket_type] = (m[c.ticket_type] ?? 0) + sessionCost(c.duration_min)
    }
    return m
  }, [classes, enrolled])

  const availableByType = (t: string) => (balanceByType[t] ?? 0) - (reservedByType[t] ?? 0)

  // Дні з доступними заняттями (для індикатора-крапки під числом).
  const daysWithClasses = useMemo<Set<string>>(() => {
    const s = new Set<string>()
    for (const c of classes) s.add(dayKey(c.starts_at))
    return s
  }, [classes])

  // ── Тижнева навігація (як в адмінці): сітка пн–нд + свайп між тижнями ──
  // Межі вікна запису = [сьогодні; сьогодні+30] (див. page.tsx). Свайп далі не йде.
  const now = useMemo(() => new Date(), [])
  const today = todayKey()
  const todayStart = useMemo(() => { const t = new Date(now); t.setHours(0, 0, 0, 0); return t }, [now])
  const minWeekStart = useMemo(() => weekOf(now)[0], [now])
  const maxWeekStart = useMemo(() => {
    const last = new Date(now); last.setDate(now.getDate() + 30)
    return weekOf(last)[0]
  }, [now])
  const maxOffset = useMemo(
    () => Math.round((maxWeekStart.getTime() - minWeekStart.getTime()) / 604800000),
    [minWeekStart, maxWeekStart]
  )

  const [weekOffset, setWeekOffset] = useState(0)
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const swipeRef = useRef<{ x: number; y: number; decided: boolean } | null>(null)

  const anchorDate = useMemo(() => {
    const a = new Date(minWeekStart); a.setDate(minWeekStart.getDate() + weekOffset * 7); return a
  }, [minWeekStart, weekOffset])
  const week = useMemo(() => weekOf(anchorDate), [anchorDate])
  const monthLabel = `${MONTHS_UK_CAP[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`

  const goPrevWeek = useCallback(() => {
    setWeekOffset(o => {
      if (o <= 0) return o
      setSlideDir('right'); return o - 1
    })
  }, [])
  const goNextWeek = useCallback(() => {
    setWeekOffset(o => {
      if (o >= maxOffset) return o
      setSlideDir('left'); return o + 1
    })
  }, [maxOffset])

  // Свайп ←/→ по стрічці тижня (порт логіки MobileScheduleTimeline).
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

  // Вибраний день: сьогодні за замовчуванням.
  const [dateSel, setDateSel] = useState<string>(today)
  // activeDay будуємо з самого ключа dateSel (а не з видимого тижня) — інакше
  // після свайпу на тиждень без вибраного дня заголовок і список зникали б.
  const activeDayKey = dateSel

  // «Сьогодні» (у шапці): повернутись на поточний тиждень + вибрати сьогодні.
  const goToday = useCallback(() => {
    setWeekOffset(0)
    setSlideDir(null)
    setDateSel(today)
  }, [today])
  const todayAction = (
    <button type="button" className={styles.bookTodayBtn} onClick={goToday}>
      Сьогодні
    </button>
  )
  const activeDay = useMemo<DayGroup>(() => {
    const [y, m, dd] = activeDayKey.split('-').map(Number)
    const local = new Date(y, m - 1, dd)
    return { key: activeDayKey, dow: local.getDay(), day: dd, month: m, year: y }
  }, [activeDayKey])

  // Distinct тренери всього вікна (для рядка фільтра).
  const allTrainers = useMemo<TrainerOption[]>(() => {
    const map = new Map<string, string>()
    for (const c of classes) {
      if (c.trainer_id && !map.has(c.trainer_id)) {
        map.set(c.trainer_id, c.trainers?.name ?? 'Тренер')
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'uk'))
  }, [classes])

  // Заняття обраного дня з фільтром тренера.
  const visibleClasses = useMemo(() => {
    return classes.filter(c => {
      if (dayKey(c.starts_at) !== activeDayKey) return false
      if (trainerFilter && c.trainer_id !== trainerFilter) return false
      return true
    })
  }, [classes, activeDayKey, trainerFilter])

  // Валідація фільтра тренера — якщо після зміни дня тренер не веде, залишаємо
  // фільтр як є (клієнт побачить порожній стан із підказкою).
  const trainerFilterName = allTrainers.find(t => t.id === trainerFilter)?.name ?? null

  async function handleEnroll(classId: string) {
    setEnrolling(classId)
    const { success, status, error } = await clientEnroll(supabase, classId)
    setEnrolling(null)
    if (!success) {
      const msg = (error && ENROLL_ERROR_LABEL[error]) || 'Не вдалося записатись'
      toast.error(msg)
      if (error === 'duplicate') setEnrolled(prev => ({ ...prev, [classId]: 'enrolled' }))
      setConfirm(null)
      return
    }
    const finalStatus: EnrolledState = status === 'waitlist' ? 'waitlist' : 'enrolled'
    setEnrolled(prev => ({ ...prev, [classId]: finalStatus }))
    if (finalStatus === 'waitlist') toast.info(enrollmentStatusLabel('waitlist'))
    else toast.success(enrollmentStatusLabel('enrolled'))
    setConfirm(null)
  }

  // Шапка з контентом. action (кнопка «Сьогодні») лише коли є тижнева стрічка.
  const wrap = (content: ReactNode, action?: ReactNode) => (
    <>
      <CabinetHeader title="Розклад" backHref="/client" hideLogout action={action} />
      <div ref={scrollRef} className={styles.scroll}>
        <div
          className={`${styles.ptrIndicator} ${releasing ? styles.ptrReleasing : ''}`}
          style={{ height: pull, opacity: pull > 0 ? 1 : 0 }}
          aria-hidden
        >
          <span className={`${styles.ptrSpinner} ${refreshing ? styles.ptrSpinning : ''}`} />
        </div>
        {content}
      </div>
    </>
  )

  if (classesError) {
    return wrap(
      <p className="badge-danger" style={{ padding: '10px 12px', borderRadius: 8 }}>
        Помилка завантаження. Спробуйте оновити сторінку.
      </p>
    )
  }
  if (loading && classes.length === 0) {
    return wrap(<div className="loading-dots"><span /><span /><span /></div>)
  }
  if (daysWithClasses.size === 0) {
    return wrap(<p className={styles.empty}>{MSG.empty.bookableClasses}.</p>)
  }

  return wrap(
    <>
      {/* ── Тижнева сітка дат (пн–нд) + свайп між тижнями — як адмінський MobileScheduleTimeline ── */}
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
            const isSelected = activeDayKey === key
            const isPast = d.getTime() < todayStart.getTime()
            const hasClasses = daysWithClasses.has(key)
            return (
              <button
                key={key}
                type="button"
                className={[
                  styles.bookDay,
                  isToday ? styles.bookDayToday : '',
                  isSelected ? styles.bookDayOn : '',
                  isPast ? styles.bookDayPast : '',
                ].filter(Boolean).join(' ')}
                aria-pressed={isSelected}
                disabled={isPast}
                onClick={() => setDateSel(key)}
              >
                <span className={styles.bookDayDow}>{DOW_LABELS_SHORT[d.getDay()]}</span>
                <span className={styles.bookDayNum}>{d.getDate()}</span>
                <span className={hasClasses && !isPast ? styles.bookDayDot : styles.bookDayDotEmpty} />
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Фільтр тренерів ── */}
      {allTrainers.length > 1 && (
        <div className={styles.bookTrainerFilter}>
          <button
            type="button"
            className={`${styles.bookTrainerChip} ${trainerFilter === null ? styles.bookTrainerChipOn : ''}`}
            onClick={() => setTrainerFilter(null)}
          >
            Всі
          </button>
          {allTrainers.map(t => (
            <button
              key={t.id}
              type="button"
              className={`${styles.bookTrainerChip} ${trainerFilter === t.id ? styles.bookTrainerChipOn : ''}`}
              onClick={() => setTrainerFilter(t.id)}
            >
              <span className={styles.bookChipAvatar}>{initials(t.name)}</span>
              {t.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Заголовок дня ── */}
      <div className={styles.bookDayHeading}>
        {dayHeading(activeDayKey, activeDay)}
      </div>

      {/* ── Список занять дня ── */}
      <div className={styles.bookSlots}>
        {visibleClasses.length === 0 && (
          <p className={styles.bookNoSessions}>
            {trainerFilter && trainerFilterName
              ? `${trainerFilterName} не веде занять у цей день. Спробуйте «Всі» або іншу дату.`
              : 'Занять у цей день немає.'}
          </p>
        )}
        {visibleClasses.map(c => {
          const state = enrolled[c.id]
          const cost = sessionCost(c.duration_min)
          const hasSessions = availableByType(c.ticket_type) >= cost
          const av = avMap[c.id]
          const toWaitlist = goesToWaitlist(av)
          const free = av?.capacity != null ? av.capacity - Math.min(av.active_count, av.capacity) : null
          const busy = enrolling === c.id

          const metaParts = [
            c.trainers?.name,
            c.halls?.name,
            `${c.duration_min} хв`,
          ].filter(Boolean).join(' · ')

          // Вже записаний — картка неактивна.
          if (state) {
            return (
              <div
                key={c.id}
                className={`${styles.bookSlot} ${styles.bookSlotEnrolled} ${state === 'waitlist' ? styles.bookSlotEnrolledWaitlist : ''}`}
              >
                <span className={styles.bookSlotTime}>{hhmm(new Date(c.starts_at))}</span>
                <span className={styles.bookSlotInfo}>
                  <span className={styles.bookSlotName}>{c.title || serviceName(c.ticket_type)}</span>
                  <span className={styles.bookSlotMeta}>{metaParts}</span>
                </span>
                <span className={styles.bookSlotTag}>{enrollmentStatusLabel(state)}</span>
              </div>
            )
          }

          return (
            <button
              key={c.id}
              type="button"
              className={`${styles.bookSlot} ${toWaitlist ? styles.bookSlotReserve : ''}`}
              disabled={!hasSessions || busy}
              onClick={() => setConfirm(c)}
            >
              <span className={styles.bookSlotTime}>{hhmm(new Date(c.starts_at))}</span>
              <span className={styles.bookSlotInfo}>
                <span className={styles.bookSlotName}>{c.title || serviceName(c.ticket_type)}</span>
                <span className={styles.bookSlotMeta}>{metaParts}</span>
              </span>
              <span className={styles.bookSlotTag}>
                {!hasSessions
                  ? 'Немає занять'
                  : toWaitlist
                  ? 'У резерв'
                  : free != null
                  ? `Вільно: ${free}`
                  : 'Записатись'}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Модалка підтвердження (без змін) ── */}
      {confirm && (() => {
        const toWaitlist = goesToWaitlist(avMap[confirm.id])
        const cost = sessionCost(confirm.duration_min)
        const after = (balanceByType[confirm.ticket_type] ?? 0) - cost
        const busy = enrolling === confirm.id
        return (
          <ModalShell
            title={toWaitlist ? 'Записатись у резерв?' : 'Підтвердити запис?'}
            onClose={() => !busy && setConfirm(null)}
            footer={
              <ModalFooter
                onCancel={() => setConfirm(null)}
                onSave={() => handleEnroll(confirm.id)}
                saveLabel={toWaitlist ? 'У резерв' : 'Записатись'}
                cancelLabel="Скасувати"
                loading={busy}
              />
            }
          >
            <div className={styles.confirmHero}>
              <div className={styles.confirmHeroName}>{confirm.title || typeLabel(confirm.ticket_type)}</div>
              <div className={styles.confirmHeroWhen}>{fullWhen(confirm.starts_at, confirm.duration_min)}</div>
              {confirm.trainers?.name && (
                <div className={styles.confirmHeroTrainer}>Тренер: {confirm.trainers.name}</div>
              )}
            </div>

            <div className={styles.confirmStageBox}>
              <span className={styles.confirmStageBoxLabel}>Етап хореографії</span>
              <span className={styles.confirmStageBoxValue}>
                {confirm.choreo_stage || <span className={styles.confirmStageEmpty}>не вказано</span>}
              </span>
            </div>

            <div className={styles.confirmCard}>
              {confirm.halls?.name && (
                <div className={styles.confirmRow}>
                  <span className={styles.confirmRowLabel}>Зал</span>
                  <span className={styles.confirmRowValue}>{confirm.halls.name}</span>
                </div>
              )}
              {toWaitlist ? (
                <div className={styles.confirmRow}>
                  <span className={styles.confirmRowLabel}>Статус</span>
                  <span className={styles.confirmRowValue}>{enrollmentStatusLabel('waitlist')}</span>
                </div>
              ) : (
                <>
                  <div className={styles.confirmRow}>
                    <span className={styles.confirmRowLabel}>Спишеться</span>
                    <span className={styles.confirmRowValue}>{cost} {pluralHours(cost)}</span>
                  </div>
                  <div className={styles.confirmRow}>
                    <span className={styles.confirmRowLabel}>Залишок стане</span>
                    <span className={styles.confirmRowValue}>{after} {pluralHours(after)}</span>
                  </div>
                </>
              )}
            </div>

            {toWaitlist && (
              <p className={styles.confirmReserve}>
                Зал заповнений. Додаємо вас у <b>резерв</b> — місце не
                гарантоване, але ми повідомимо, щойно воно звільниться.
              </p>
            )}
          </ModalShell>
        )
      })()}
    </>,
    todayAction,
  )
}
